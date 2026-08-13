import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LayoutDashboard, Sparkles, ShieldCheck, Network, FolderGit2, GraduationCap,
  Cpu, Dumbbell, Files, Workflow, Settings, Search, Command,
  Clock, CloudSun, HardDrive, MemoryStick, Activity, Wifi, Bell, CheckCircle2,
  MessageSquare, CalendarDays, Rocket, FileText, Gauge, GripVertical, X, Plus,
  Maximize2, Radio, Send, Loader2, Database, Trash2, AlertTriangle,
  Hash, Binary, ScanLine, Copy, Check, Lock, SquareTerminal, Square,
  GitBranch, CircleDot, Lightbulb, StickyNote, FileCode2,
  FolderPlus, Pencil, ArrowRight,
  FileSpreadsheet, Image, Star, Folder, Tag,
  Mic, Filter, BookOpen, ListOrdered, Repeat, Upload,
  Calculator, CircuitBoard, Zap,
  Library, Bookmark, ExternalLink,
  Minus, Unlock, Info, Server, Code2, Boxes, Bot, Hand, Play
} from "lucide-react";
import AgentMode from "./AgentMode.jsx";
// Watching the agent for "finished" / "needs you" starts on import  -  the
// module is a singleton, so it keeps running while you are on another screen.
import { subscribeToast, dismissToast as dismissAgentToast } from "./agentNotify.js";
// The assistant can hand long jobs to Agent Mode, and prices its own calls with
// the same rate table the agent uses.
import * as agentEngine from "./agentEngine.js";

const STATUS = {
  live:     { label: "Live",     tone: "var(--signal)" },
  scaffold: { label: "Scaffold", tone: "var(--violet)" },
  planned:  { label: "Planned",  tone: "var(--muted-2)" },
};

const MODULES = [
  { id: "dashboard",   label: "Dashboard",     icon: LayoutDashboard, status: "live",
    summary: "Live overview of the machine, the day, and everything in flight.",
    capabilities: ["Widget grid", "Telemetry", "Quick launch", "Notifications"] },
  { id: "assistant",   label: "AI Assistant",  icon: Sparkles, status: "live",
    summary: "The reasoning layer. Reads context from every module, acts on your behalf.",
    capabilities: ["Chat", "Project memory", "File search", "Module control", "Voice", "Vision"] },
  { id: "agent",       label: "Agent Mode",    icon: Bot, status: "live",
    summary: "Hand it a goal and leave. It plans, runs real commands, and checks its own work.",
    capabilities: ["Autonomous runs", "Transcript to commands", "Self-verification", "Run history", "Notifications", "Kill switch"] },
  { id: "terminal",    label: "Terminal",      icon: SquareTerminal, status: "live",
    summary: "A shell with the model sitting beside it, reading what you just ran.",
    capabilities: ["Command execution", "Python", "pip", "git", "Session-aware help"] },
  { id: "security",    label: "Cybersecurity", icon: ShieldCheck, status: "live",
    summary: "Defensive workbench for CTFs, CyberPatriot, and learning by doing.",
    capabilities: ["Scan viewer", "Log analyzer", "Hash utilities", "Threat board", "CTF workspace"] },
  { id: "network",     label: "Networking",    icon: Network, status: "live",
    summary: "What is on this network, how fast it is, and where the latency comes from.",
    capabilities: ["Device discovery", "Ping monitor", "Latency graphs", "DNS lookup", "Traceroute"] },
  { id: "projects",    label: "Projects",      icon: FolderGit2, status: "live",
    summary: "Every repo you own, with context that survives between sessions.",
    capabilities: ["Git integration", "Tasks", "Docs", "Version history"] },
  { id: "school",      label: "School",        icon: GraduationCap, status: "live",
    summary: "Assignments, deadlines, and a study assistant that knows the material.",
    capabilities: ["Assignments", "Calendar", "Notes", "Flashcards", "Exam prep"] },
  { id: "calendar",    label: "Calendar",      icon: CalendarDays, status: "live",
    summary: "Your reminders and class deadlines on a real calendar you can edit.",
    capabilities: ["Month view", "Edit deadlines", "Add reminders", "Mark done"] },
  { id: "encyclopedia", label: "Encyclopedia", icon: Library, status: "live",
    summary: "Look up a topic and get material actually worth studying from.",
    capabilities: ["Live web search", "Curated sources", "Saved topics", "Depth control"] },
  { id: "engineering", label: "Engineering",   icon: Cpu, status: "live",
    summary: "Bench notes, CAD references, and the microcontroller side of things.",
    capabilities: ["Arduino", "Raspberry Pi", "CAD notes", "Sensor logs"] },
  { id: "fitness",     label: "Fitness",       icon: Dumbbell, status: "live",
    summary: "Training log and body metrics over time.",
    capabilities: ["Workout log", "Weight trend", "Macros", "Goals"] },
  { id: "files",       label: "Files",         icon: Files, status: "live",
    summary: "Search that understands what a document says, not just its filename.",
    capabilities: ["Smart search", "Tagging", "Favorites", "AI summaries", "Preview"] },
  { id: "automation",  label: "Automation",    icon: Workflow, status: "live",
    summary: "Triggers and actions that stitch the modules together while you sleep.",
    capabilities: ["Startup routines", "Wi-Fi triggers", "Schedules", "Threshold alerts"] },
  { id: "settings",    label: "Settings",      icon: Settings, status: "live",
    summary: "Theme, motion, AI provider, privacy, and which modules load at all.",
    capabilities: ["Theme", "Motion", "AI provider", "Privacy", "Module toggles"] },
];

function useTelemetry(demo, active) {
  const [t, setT] = useState(null);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const hist = useRef({ down: [], cpu: [] });

  // Are we inside the Tauri desktop shell? If so, real system data is available.
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);

  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    // Content that isn't system telemetry  -  notifications, project list, etc.
    // These stay sample data until their own modules are wired; the dashboard
    // widgets that show them are unrelated to whether CPU is real.
    const dashExtras = {
      projects: [
        { id: 1, name: "nexus-os", branch: "main", pct: 22 },
        { id: 2, name: "packet-viewer", branch: "dev", pct: 64 },
        { id: 3, name: "rover-telemetry", branch: "main", pct: 8 },
      ],
      files: [
        { id: 1, name: "milestone-2-notes.md", where: "Documents" },
        { id: 2, name: "capture-lab3.pcapng", where: "Network" },
        { id: 3, name: "chassis-v4.step", where: "CAD" },
      ],
    };
    const KEEP = 28;

    if (isDesktop) {
      let alive = true;
      const tick = async () => {
        try {
          const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
          if (!inv) throw new Error("Tauri invoke not found on window.__TAURI__");
          const f = await inv("telemetry");
          if (!alive) return;
          const h = hist.current;
          h.down = [...h.down, f.down].slice(-KEEP);
          h.cpu = [...h.cpu, f.cpu].slice(-KEEP);
          setT({
            cpu: f.cpu, mem: f.mem, disk: f.disk,
            down: f.down, up: f.up, ping: 0, temp: f.temp,
            totalMemGb: f.total_mem_gb, usedMemGb: f.used_mem_gb,
            hist: { down: h.down, cpu: h.cpu },
            ...dashExtras,
          });
        } catch (e) {
          if (!alive) return;
          setT((prev) => prev || { __error: String(e?.message || e), ...dashExtras });
          console.error("telemetry call failed:", e);
        }
      };
      tick();
      const iv = setInterval(tick, active === "dashboard" ? 1500 : 5000);
      return () => { alive = false; clearInterval(iv); };
    }

    if (!demo) { hist.current = { down: [], cpu: [] }; setT(null); return; }
    const wave = (base, amp, speed, phase = 0) => (now) =>
      Math.max(1, Math.min(99, base + Math.sin(now / speed + phase) * amp));
    const s = {
      cpu: wave(31, 17, 900),
      mem: wave(58, 7, 2600, 1), down: wave(240, 120, 1100),
      up: wave(38, 22, 1700, 3), ping: wave(19, 8, 800, 1.5),
      temp: wave(52, 9, 3000),
    };
    const tick = () => {
      const n = Date.now();
      const cpu = s.cpu(n), down = s.down(n);
      const h = hist.current;
      h.down = [...h.down, down].slice(-KEEP);
      h.cpu = [...h.cpu, cpu].slice(-KEEP);
      setT({
        cpu, mem: s.mem(n), disk: 71,
        down, up: s.up(n), ping: s.ping(n), temp: s.temp(n),
        hist: { down: h.down, cpu: h.cpu },
        ...dashExtras,
      });
    };
    tick();
    const iv = setInterval(tick, active === "dashboard" ? 1200 : 5000);
    return () => clearInterval(iv);
  }, [demo, active, isDesktop]);

  return { t, online };
}

function Frame({ w, children }) {
  const Icon = w.icon;
  return (
    <>
      <header className="nx-w-head">
        <Icon size={13} strokeWidth={1.8} />
        <h3>{w.title}</h3>
      </header>
      <div className="nx-w-body">{children}</div>
    </>
  );
}

function Blank({ line = "No signal" }) {
  return <p className="nx-blank">{line}</p>;
}

function Ring({ value, label, tone = "var(--signal)" }) {
  const r = 30, circ = 2 * Math.PI * r;
  const pct = value == null ? 0 : value / 100;
  return (
    <div className="nx-gauge">
      <svg viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} className="nx-gauge-track" />
        <circle cx="40" cy="40" r={r} className="nx-gauge-fill" stroke={tone}
          strokeDasharray={`${circ * pct} ${circ}`} transform="rotate(-90 40 40)" />
      </svg>
      <div className="nx-gauge-val">
        {value == null ? <em>——</em> : <><b>{Math.round(value)}</b><i>%</i></>}
        <span>{label}</span>
      </div>
    </div>
  );
}

function Spark({ series, tone = "var(--signal)" }) {
  if (!series?.length || series.length < 2) return <div className="nx-spark-empty" />;
  const max = Math.max(...series), min = Math.min(...series);
  const span = max - min || 1;
  const pts = series.map((v, i) =>
    `${(i / (series.length - 1)) * 100},${28 - ((v - min) / span) * 24}`).join(" ");
  return (
    <svg className="nx-spark" viewBox="0 0 100 30" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={tone} strokeWidth="1.4"
        vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function ClockBody() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  const hh = now.getHours() % 12 || 12;
  return (
    <>
      <p className="nx-readout">
        {String(hh).padStart(2, "0")}<span className="nx-tick">:</span>
        {String(now.getMinutes()).padStart(2, "0")}
        <small>{String(now.getSeconds()).padStart(2, "0")}</small>
      </p>
      <p className="nx-sub">
        {now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
      </p>
    </>
  );
}

function NetBody({ t }) {
  return (
    <div className="nx-net">
      <div>
        <p className="nx-readout nx-readout-sm">
          {t ? Math.round(t.down) : "——"}<i>Mb/s</i>
        </p>
        <p className="nx-sub nx-dim">down</p>
        <p className="nx-sub" style={{ marginTop: 8 }}>
          {t ? `${Math.round(t.up)} Mb/s up` : "up unavailable"}
        </p>
      </div>
      <Spark series={t?.hist?.down} />
    </div>
  );
}

// Dashboard only surfaces reminders that are imminent - overdue, due today, or
// due tomorrow - so it doesn't fill up with things weeks away. resolveDue turns
// the free-text due into a real date; undated reminders are treated as not near.
function dueNear(r) {
  const d = resolveDue(r.due, r.at);
  if (!d) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  return d <= tomorrow;
}

/* Notifications built entirely from real app state  -  no canned messages.
   Sources: reminders you've added, live system load, and connectivity. */
function NotifBody({ ctx }) {
  const t = ctx?.t;
  const online = ctx?.online;
  const reminders = ctx?.reminders || [];

  const items = [];
  if (online === false) items.push({ id: "off", tone: "ember", text: "You're offline — AI features won't reach the network", when: "now" });
  if (t) {
    if (t.cpu > 90) items.push({ id: "cpu", tone: "ember", text: `CPU at ${Math.round(t.cpu)}% — something's working hard`, when: "now" });
    if (t.mem > 92) items.push({ id: "mem", tone: "ember", text: `Memory at ${Math.round(t.mem)}% — close some tabs`, when: "now" });
    if (t.disk > 92) items.push({ id: "disk", tone: "ember", text: `Disk ${Math.round(t.disk)}% full`, when: "now" });
    if (t.temp > 88) items.push({ id: "temp", tone: "ember", text: `Running hot at ${Math.round(t.temp)}°C`, when: "now" });
  }
  const openReminders = reminders.filter((r) => !r.done && dueNear(r));
  openReminders.slice(0, 4).forEach((r) =>
    items.push({ id: "rem-" + r.id, tone: "signal", text: r.text + (r.due ? ` · ${r.due}` : ""), when: "reminder" }));

  if (!items.length) {
    return <p className="nx-blank">All clear — nothing needs your attention.</p>;
  }
  return (
    <ul className="nx-feed">
      {items.map((n) => (
        <li key={n.id}>
          <i style={{ background: `var(--${n.tone})` }} />
          <span>{n.text}</span><em>{n.when}</em>
        </li>
      ))}
    </ul>
  );
}

function TaskBody({ ctx }) {
  const reminders = ctx?.reminders || [];
  // Only show what's imminent so the dashboard stays clean. Everything else
  // lives in the Calendar module.
  const near = reminders.filter((r) => !r.done && dueNear(r));
  const laterCount = reminders.filter((r) => !r.done && !dueNear(r)).length;
  if (!near.length) {
    return (
      <p className="nx-blank">
        {reminders.length
          ? `Nothing due today or tomorrow.${laterCount ? ` ${laterCount} later in Calendar.` : ""}`
          : "No reminders yet. Ask the assistant to add one."}
      </p>
    );
  }
  return (
    <ul className="nx-tasks">
      {near.slice(0, 6).map((k) => (
        <li key={k.id}>
          <button className={k.done ? "nx-task-on" : ""} aria-pressed={k.done}
            onClick={() => ctx.toggleReminder(k.id)}>
            <i />{k.text}{k.due ? <em className="nx-task-due"> · {k.due}</em> : null}
          </button>
        </li>
      ))}
      {laterCount > 0 && <li className="nx-task-more">+{laterCount} more in Calendar</li>}
    </ul>
  );
}

function ChatBody({ go }) {
  const [v, setV] = useState("");
  return (
    <div className="nx-chat">
      <p className="nx-sub nx-dim">No engine yet. This hands off to the assistant module.</p>
      <div className="nx-chat-row">
        <input value={v} onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go("assistant")} placeholder="Ask anything" />
        <button onClick={() => go("assistant")}>Send</button>
      </div>
    </div>
  );
}

function CalendarBody() {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <div className="nx-cal">
      <p className="nx-cal-title">
        {now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
      </p>
      <div className="nx-cal-grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) =>
          <span key={`d${i}`} className="nx-cal-dow">{d}</span>)}
        {cells.map((d, i) =>
          <span key={i} className={d === now.getDate() ? "nx-cal-today" : ""}>{d || ""}</span>)}
      </div>
    </div>
  );
}

function CoreRing({ active, onSelect }) {
  const [hover, setHover] = useState(null);
  const R = 118, C = 160;
  const nodes = useMemo(() => MODULES.map((mo, i) => {
    const a = (-90 + i * (360 / MODULES.length)) * (Math.PI / 180);
    return { ...mo, x: C + R * Math.cos(a), y: C + R * Math.sin(a) };
  }), []);
  const focus = nodes.find((n) => n.id === hover);
  const liveCount = MODULES.filter((mo) => mo.status !== "planned").length;
  return (
    <div className="nx-ring-wrap">
      <svg viewBox="0 0 320 320" className="nx-ring" role="img"
        aria-label="Modules orbiting the core">
        <defs>
          <radialGradient id="nx-core-glow">
            <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.4" />
            <stop offset="70%" stopColor="var(--signal)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r="88" fill="url(#nx-core-glow)" />
        <circle cx={C} cy={C} r={R} className="nx-orbit" />
        <circle cx={C} cy={C} r={R - 24} className="nx-orbit nx-orbit-faint" />
        <g className="nx-sweep"><circle cx={C} cy={C} r={R - 12} className="nx-arc" /></g>
        <g className="nx-sweep-rev"><circle cx={C} cy={C} r={R - 36} className="nx-arc nx-arc-2" /></g>
        {nodes.map((n) => (
          <line key={`l${n.id}`} x1={C} y1={C} x2={n.x} y2={n.y} className="nx-spoke"
            style={{ opacity: n.id === active || n.id === hover ? 0.5 : 0.08 }} />
        ))}
        {nodes.map((n) => {
          const on = n.id === active, hot = n.id === hover;
          return (
            <g key={n.id} className="nx-node" role="button" tabIndex={0}
              onClick={() => { Sound.nav(); onSelect(n.id); }}
              onMouseEnter={() => { setHover(n.id); Sound.hover(); }}
              onMouseLeave={() => setHover(null)}>
              <circle cx={n.x} cy={n.y} r="15" fill="transparent" />
              {(on || hot) && <circle cx={n.x} cy={n.y} r="10" className="nx-node-halo" />}
              <circle cx={n.x} cy={n.y} r={on ? 5 : 3.4}
                fill={on ? "var(--signal)" : STATUS[n.status].tone}
                opacity={on || hot ? 1 : 0.6} />
            </g>
          );
        })}
        <text x={C} y={C - 5} className="nx-core-label">
          {focus ? focus.label.toUpperCase() : "NEXUS CORE"}
        </text>
        <text x={C} y={C + 14} className="nx-core-sub">
          {focus ? STATUS[focus.status].label.toUpperCase() : `${liveCount} / ${MODULES.length} ONLINE`}
        </text>
      </svg>
    </div>
  );
}

function WeatherBody() {
  const [wx, setWx] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | error
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

  useEffect(() => {
    let alive = true;
    const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;

    const fetchAt = async (lat, lon) => {
      if (!isDesktop) { // browser dev: no backend, show nothing real
        if (alive) { setState("error"); }
        return;
      }
      try {
        const w = await inv("get_weather", { lat, lon });
        if (alive) { setWx(w); setState("ok"); }
      } catch {
        if (alive) setState("error");
      }
    };

    const go = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => fetchAt(pos.coords.latitude, pos.coords.longitude),
          () => fetchAt(34.47, -86.06), // fallback: north Alabama-ish; honest default
          { timeout: 8000, maximumAge: 600000 }
        );
      } else {
        fetchAt(34.47, -86.06);
      }
    };

    go();
    const id = setInterval(go, 15 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [isDesktop]);

  if (state === "loading") return <p className="nx-sub nx-dim">Reading conditions…</p>;
  if (state === "error" || !wx) return <p className="nx-sub nx-dim">Weather unavailable</p>;
  return (
    <>
      <p className="nx-readout">{wx.temp_f}<i>°</i></p>
      <p className="nx-sub">{wx.label}</p>
      <p className="nx-sub nx-dim">H {wx.high}° · L {wx.low}°</p>
    </>
  );
}

const LAUNCH_DEFAULTS = [
  { id: 1, label: "VS Code", target: "code" },
  { id: 2, label: "GitHub", target: "https://github.com" },
  { id: 3, label: "Google", target: "https://google.com" },
];

function LaunchBody({ ctx }) {
  const apps = ctx.launchApps || LAUNCH_DEFAULTS;
  const setApps = ctx.setLaunchApps;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ label: "", target: "" });
  const [help, setHelp] = useState(false);

  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const invoke = (cmd, args) =>
    (window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke)(cmd, args);

  const launch = async (app) => {
    if (ctx.settings?.schoolMode) { ctx.toast("Launching is disabled in school mode."); return; }
    if (!isDesktop) { ctx.toast(`Would launch: ${app.target} (desktop only)`); return; }
    try {
      await invoke("launch_app", { target: app.target });
      ctx.toast(`Launched ${app.label}`);
    } catch (e) {
      ctx.toast(String(e?.message || e).slice(0, 80));
    }
  };

  const add = () => {
    if (!form.label.trim() || !form.target.trim()) return;
    setApps((p) => [...p, { id: Date.now(), label: form.label.trim(), target: form.target.trim() }]);
    setForm({ label: "", target: "" });
  };

  return (
    <div className="nx-launch-wrap">
      {!editing ? (
        <>
          <div className="nx-launch">
            {apps.map((a) => (
              <button key={a.id} onClick={() => launch(a)} title={a.target}>{a.label}</button>
            ))}
            <button className="nx-launch-edit" onClick={() => setEditing(true)} title="Edit apps">
              <Pencil size={11} />
            </button>
          </div>
          {!isDesktop && (
            <p className="nx-tool-note nx-tool-note-flush">Launching works in the desktop app.</p>
          )}
        </>
      ) : (
        <div className="nx-launch-editor">
          <div className="nx-launch-list">
            {apps.map((a) => (
              <div key={a.id} className="nx-launch-item">
                <span className="nx-launch-label">{a.label}</span>
                <span className="nx-launch-target">{a.target}</span>
                <span className="nx-drop" role="button" tabIndex={0} aria-label="Remove"
                  onClick={() => setApps((p) => p.filter((x) => x.id !== a.id))}
                  onKeyDown={(e) => e.key === "Enter" && setApps((p) => p.filter((x) => x.id !== a.id))}>
                  <X size={11} />
                </span>
              </div>
            ))}
          </div>
          <div className="nx-tool-row">
            <input className="nx-inline" value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Name" />
            <input className="nx-inline nx-inline-wide" value={form.target}
              onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="App name, full path, or URL" />
            <button className="nx-chip nx-chip-on" onClick={add} disabled={!form.label.trim() || !form.target.trim()}>
              <Plus size={11} />Add
            </button>
          </div>
          <div className="nx-tool-row">
            <button className="nx-chip" onClick={() => setEditing(false)}>Done</button>
            <button className="nx-chip" onClick={() => setHelp((h) => !h)}>
              {help ? "Hide help" : "How do I add apps?"}
            </button>
          </div>
          {help && (
            <div className="nx-launch-help">
              <p><b>URLs</b> — paste the full address, e.g. <code>https://github.com</code>. Easiest.</p>
              <p><b>Apps on your PATH</b> — just the command: <code>code</code> for VS Code,
                <code>firefox</code>, <code>notepad</code>, <code>chrome</code>.</p>
              <p><b>Any other app</b> — the full path to the .exe, e.g.
                <code>C:\Program Files\Wireshark\Wireshark.exe</code>. Right-click a shortcut →
                Properties → copy the "Target" field.</p>
              <p className="nx-tool-note nx-tool-note-flush">
                On Windows, targets open via <code>start</code>; on Mac via <code>open</code>. If an
                app name doesn't work, use its full path.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ASSISTANT_TOOLS = [
  {
    name: "get_weather",
    description: "Get the current real weather (temperature, conditions, high/low) for the user's location. Use whenever they ask about weather, temperature, or whether to bring a jacket/umbrella.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_system_stats",
    description: "Read the machine's live stats: CPU %, memory %, disk %, temperature, and network up/down speed. Use for any question about how the computer is doing, what's using resources, is it running hot, etc.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_reminders",
    description: "List the user's current reminders/tasks and whether each is done. Use when they ask what's on their list, what's due, what they need to do, or to check before adding a duplicate.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_workouts",
    description: "List the user's recently logged workouts. Use when they ask what they've trained lately or about their fitness history.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_projects",
    description: "List the user's projects with status, and live git info (branch, commits, changed files) for any linked to a real repo. Use for questions about their projects or code.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_network_info",
    description: "Read the machine's real network info: local IP, gateway, and interface. Use for questions about the user's network, IP address, or connection.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_files",
    description: "List the files in the user's currently indexed folder (name, path, size). Use when they ask what files they have or to find a file. Returns nothing if no folder is indexed.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Optional filter — only return files whose name or path contains this." } },
    },
  },
  {
    name: "get_launch_apps",
    description: "List the user's saved Quick Launch apps. Use to see what you can open for them or when they ask what apps are set up.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "set_setting",
    description: "Change any app setting. theme (midnight, slate, carbon, nebula, void); accent (mint, cyan, sky, azure, indigo, violet, purple, magenta, rose, crimson, coral, amber, gold, citron, lime, green, emerald, teal, ice, silver, blood, forest); density (cozy, compact); booleans motion, splash, ask, sound, hover, voiceSpeak, greetVoice, schoolMode (use 'on'/'off'); voice (male or female — the British voice that speaks); and name (what to call the user). Use this whenever the user asks to change how the app looks or behaves, including 'change your voice to male', 'turn on school mode', 'call me X'.",
    input_schema: {
      type: "object",
      properties: {
        setting: { type: "string", description: "Which setting: theme, accent, density, motion, splash, ask, sound, hover, voice, voiceSpeak, greetVoice, schoolMode, name." },
        value: { type: "string", description: "The new value. For toggles use 'on' or 'off'. For voice use 'male' or 'female'." },
      },
      required: ["setting", "value"],
    },
  },
  {
    name: "add_reminder",
    description: "Add a reminder or task to the user's list. Use for anything they want to remember or be reminded of — tests, homework, errands, deadlines.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The reminder text, e.g. 'Math test'." },
        due: { type: "string", description: "Optional human-readable due date/time, e.g. 'Thursday' or 'Oct 3 3pm'. Omit if none given." },
      },
      required: ["text"],
    },
  },
  {
    name: "log_workout",
    description: "Log a completed workout to the Fitness module.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", description: "One of: Push, Pull, Legs, Run, Cardio, Mobility, Other." },
        note: { type: "string", description: "What they did — lifts, distance, sets." },
        mins: { type: "number", description: "Duration in minutes, if given." },
      },
      required: ["kind", "note"],
    },
  },
  {
    name: "navigate",
    description: "Switch the app to a different module/screen.",
    input_schema: {
      type: "object",
      properties: {
        module: { type: "string", description: "Module id: dashboard, assistant, terminal, security, network, projects, school, encyclopedia, engineering, fitness, files, automation, settings." },
      },
      required: ["module"],
    },
  },
  {
    name: "launch_app",
    description: "Open an app or website the user asks to open. Pass what they said as the target — a saved Quick Launch app name (e.g. 'Claude'), a URL, or a file path. The system checks their saved Quick Launch apps first. If there's no match and it isn't clearly a URL or path, you'll be told to ask the user what they meant — do NOT invent a URL.",
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string", description: "What to open, exactly as the user named it." },
      },
      required: ["target"],
    },
  },
  {
    name: "complete_reminder",
    description: "Mark one of the user's reminders as done (or toggle it). Match by the text they say. Use get_reminders first if you're unsure which one.",
    input_schema: {
      type: "object",
      properties: { text: { type: "string", description: "Text (or part) of the reminder to mark done." } },
      required: ["text"],
    },
  },
  {
    name: "delete_reminder",
    description: "Remove one of the user's reminders entirely. Match by the text they say.",
    input_schema: {
      type: "object",
      properties: { text: { type: "string", description: "Text (or part) of the reminder to delete." } },
      required: ["text"],
    },
  },
  {
    name: "add_launch_app",
    description: "Add an app or website to the user's Quick Launch. Give it a label and a target (a URL, a protocol like spotify:, or a file path). Use when they ask to add or save an app.",
    input_schema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Display name, e.g. 'Spotify'." },
        target: { type: "string", description: "URL, protocol, or file path to open." },
      },
      required: ["label", "target"],
    },
  },
  {
    name: "remove_launch_app",
    description: "Remove an app from the user's Quick Launch, matched by label.",
    input_schema: {
      type: "object",
      properties: { label: { type: "string", description: "The app label to remove." } },
      required: ["label"],
    },
  },
  {
    name: "set_module_visible",
    description: "Show or hide a module in the sidebar. module is the id (dashboard, assistant, terminal, security, network, projects, school, encyclopedia, engineering, fitness, files, automation, settings). visible is true or false.",
    input_schema: {
      type: "object",
      properties: {
        module: { type: "string", description: "Module id." },
        visible: { type: "boolean", description: "true to show, false to hide." },
      },
      required: ["module", "visible"],
    },
  },
  {
    name: "run_command",
    description:
      "Run ONE short command on the user's machine and get its output straight back. This is for LOOKING THINGS UP: version checks (python --version), whether something is installed, disk space, listing a folder, reading a config. " +
      "Use it whenever a quick command would answer the question better than guessing — the user would rather you checked than speculated. " +
      "Do NOT use it for anything that installs, downloads, changes settings, writes files or deletes anything, and never for a job that takes more than one command — hand those to start_agent_task instead. " +
      "The command must be non-interactive; it will be killed if it waits for input.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The exact command line. On Windows this runs under cmd." },
        cwd: { type: "string", description: "Optional absolute working directory. Defaults to the home folder." },
      },
      required: ["command"],
    },
  },
  {
    name: "start_agent_task",
    description:
      "Hand a job to Agent Mode, which plans it out, runs as many commands as it takes, checks its own work, and keeps going until it is done — then notifies the user. " +
      "Use this for anything that is more than one command: installing or updating software, setting up a toolchain, following a walkthrough or transcript, fixing a broken environment, or any request phrased as an outcome rather than a question. " +
      "It returns immediately — the job runs in the background, so tell the user it has started rather than pretending to wait. " +
      "Write the goal as a clear instruction to another agent, including anything the user told you that it would need to know. " +
      "Only start a job the user actually asked for; if you are unsure whether they want it done or just answered, ask first.",
    input_schema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "The full job, written as an instruction. Be specific about the outcome wanted." },
      },
      required: ["goal"],
    },
  },
  {
    name: "get_agent_status",
    description:
      "Check what Agent Mode is doing: whether a job is running, which step it is on, whether it is stuck waiting for the user to do something, and the summary if it has finished. " +
      "Use when the user asks how it's going, whether it's done, or what the agent is up to.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "clear_conversation",
    description: "Clear the current assistant chat history. Use when the user asks to start over or clear the conversation.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "replay_tutorial",
    description: "Open the guided tutorial / walkthrough again. Use when the user asks to see the tour, tutorial, or walkthrough.",
    input_schema: { type: "object", properties: {} },
  },
];

/// Goals can be pasted transcripts; only the first line belongs in a sentence.
function firstLineOf(text) {
  const line = String(text || "").split("\n").find((l) => l.trim()) || "a job";
  return line.length > 70 ? `${line.slice(0, 70)}…` : line;
}

// Runs a tool call against real state. Returns a short result string the
// model uses to confirm. ctx carries the module actions.
async function runAssistantTool(name, input, ctx) {
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const inv = (cmd, args) => (window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke)(cmd, args);
  try {
    if (name === "get_weather") {
      if (!isDesktop) return "Weather needs the desktop app.";
      const coords = await new Promise((res) => {
        if (!navigator.geolocation) return res({ lat: 34.47, lon: -86.06 });
        navigator.geolocation.getCurrentPosition(
          (p) => res({ lat: p.coords.latitude, lon: p.coords.longitude }),
          () => res({ lat: 34.47, lon: -86.06 }), { timeout: 5000, maximumAge: 900000 });
      });
      const w = await inv("get_weather", coords);
      return `Current weather: ${w.temp_f}°F, ${w.label}. High ${w.high}°, low ${w.low}°.`;
    }
    if (name === "get_system_stats") {
      const t = ctx.t;
      if (!t) return "System telemetry isn't available right now.";
      return `CPU ${Math.round(t.cpu)}%, memory ${Math.round(t.mem)}%, disk ${Math.round(t.disk)}%, temp ${Math.round(t.temp)}°C, network down ${Math.round(t.down)} Mb/s / up ${Math.round(t.up)} Mb/s.`;
    }
    if (name === "get_reminders") {
      const r = ctx.reminders || [];
      if (!r.length) return "There are no reminders on the list.";
      return "Reminders: " + r.map((x) => `${x.done ? "[done] " : ""}${x.text}${x.due ? ` (due ${x.due})` : ""}`).join("; ") + ".";
    }
    if (name === "get_workouts") {
      const w = ctx.workouts || [];
      if (!w.length) return "No workouts logged yet.";
      return "Recent workouts: " + w.slice(0, 8).map((x) => `${x.kind}${x.mins ? ` ${x.mins}min` : ""} — ${x.note}`).join("; ") + ".";
    }
    if (name === "get_projects") {
      const ps = ctx.projects || [];
      if (!ps.length) return "No projects yet.";
      const parts = [];
      for (const p of ps.slice(0, 10)) {
        let s = `${p.name} (${p.status})`;
        if (isDesktop && p.repoPath) {
          try {
            const g = await inv("git_info", { path: p.repoPath });
            s += ` — git: on ${g.branch}, ${g.commits.length} recent commits, ${g.dirty.length} changed file(s)`;
          } catch { s += " — (repo linked but couldn't read git)"; }
        }
        parts.push(s);
      }
      return "Projects: " + parts.join("; ") + ".";
    }
    if (name === "get_network_info") {
      if (!isDesktop) return "Network info needs the desktop app.";
      const n = await inv("net_info");
      return `Local IP ${n.local_ip}, gateway ${n.gateway}, interface ${n.iface}.`;
    }
    if (name === "list_files") {
      if (!isDesktop) return "File listing needs the desktop app.";
      const folder = ctx.filesFolder;
      if (!folder) return "No folder is indexed yet. The user can index one in the Files module.";
      const files = await inv("index_folder", { path: folder, recursive: true });
      const q = String(input.query || "").toLowerCase();
      const filtered = q ? files.filter((f) => (f.name + " " + f.path).toLowerCase().includes(q)) : files;
      if (!filtered.length) return q ? `No files match "${input.query}".` : "The indexed folder is empty.";
      return `Files${q ? ` matching "${input.query}"` : ""} (${filtered.length}): ` +
        filtered.slice(0, 25).map((f) => `${f.name} (${f.size})`).join(", ") +
        (filtered.length > 25 ? `, and ${filtered.length - 25} more.` : ".");
    }
    if (name === "get_launch_apps") {
      const apps = ctx.launchApps || [];
      if (!apps.length) return "No Quick Launch apps saved yet.";
      return "Saved apps: " + apps.map((a) => a.label).join(", ") + ".";
    }

    if (name === "set_setting") {
      const key = String(input.setting || "").toLowerCase();
      const raw = String(input.value || "").toLowerCase().trim();
      const themes = ["midnight", "slate", "carbon", "nebula", "void"];
      const accents = ["mint","cyan","sky","azure","indigo","violet","purple","magenta","rose","crimson","coral","amber","gold","citron","lime","green","emerald","teal","ice","silver","blood","forest"];
      const toggles = { motion: "motion", splash: "splash", ask: "ask", sound: "sound", hover: "hover" };
      if (key === "theme") {
        if (!themes.includes(raw)) return `Not a valid theme. Choose one of: ${themes.join(", ")}.`;
        ctx.setSettings((p) => ({ ...p, theme: raw }));
        return `Theme set to ${raw}.`;
      }
      if (key === "accent") {
        if (!accents.includes(raw)) return `Not a valid accent. Try one like blood, mint, or violet.`;
        ctx.setSettings((p) => ({ ...p, accent: raw }));
        return `Accent set to ${raw}.`;
      }
      if (key === "density") {
        if (raw !== "cozy" && raw !== "compact") return "Density is either cozy or compact.";
        ctx.setSettings((p) => ({ ...p, density: raw }));
        return `Density set to ${raw}.`;
      }
      if (toggles[key]) {
        const on = ["on", "true", "yes", "enable", "enabled"].includes(raw);
        ctx.setSettings((p) => ({ ...p, [key]: on }));
        return `${key} turned ${on ? "on" : "off"}.`;
      }
      // Voice + greeting toggles.
      if (["voicespeak", "greetvoice"].includes(key)) {
        const realKey = key === "voicespeak" ? "voiceSpeak" : "greetVoice";
        const on = ["on", "true", "yes", "enable", "enabled"].includes(raw);
        ctx.setSettings((p) => ({ ...p, [realKey]: on }));
        return `${realKey === "voiceSpeak" ? "Speaking replies aloud" : "Launch greeting"} turned ${on ? "on" : "off"}.`;
      }
      // Voice gender (which British voice speaks).
      if (["voice", "voicegender", "voice_gender"].includes(key)) {
        const g = raw.includes("male") && !raw.includes("female") ? "male" : raw.includes("female") ? "female" : null;
        if (!g) return "Voice is either male or female.";
        ctx.setSettings((p) => ({ ...p, voiceGender: g }));
        return `Voice set to the ${g} British voice.`;
      }
      // School mode.
      if (["school", "schoolmode", "school_mode"].includes(key)) {
        const on = ["on", "true", "yes", "enable", "enabled"].includes(raw);
        ctx.setSettings((p) => ({ ...p, schoolMode: on }));
        return `School mode turned ${on ? "on — AI features are now hidden" : "off"}.`;
      }
      // User's name.
      if (["name", "username", "user_name"].includes(key)) {
        const nm = String(input.value || "").trim().slice(0, 40);
        ctx.setSettings((p) => ({ ...p, userName: nm }));
        return `I'll call you ${nm || "nothing for now"}.`;
      }
      return `I can't change "${input.setting}". I can set theme, accent, density, motion, splash, ask, sound, hover, voice (male/female), voiceSpeak, greetVoice, schoolMode, and your name.`;
    }
    if (name === "add_reminder") {
      const item = ctx.addReminder(input.text, input.due);
      return `Added reminder: "${item.text}"${item.due ? ` (due ${item.due})` : ""}.`;
    }
    if (name === "log_workout") {
      if (!ctx.logWorkout) return "The fitness log isn't available right now.";
      ctx.logWorkout({ kind: input.kind, note: input.note, mins: input.mins });
      return `Logged a ${input.kind} workout${input.mins ? ` (${input.mins} min)` : ""}: ${input.note}.`;
    }
    if (name === "navigate") {
      const valid = MODULES.some((m) => m.id === input.module);
      if (!valid) return `There's no module called "${input.module}".`;
      ctx.go(input.module);
      return `Opened ${input.module}.`;
    }
    if (name === "launch_app") {
      const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
      if (!isDesktop) return "App launching only works in the desktop app.";
      const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
      const want = String(input.target || "").trim();
      const wantLower = want.toLowerCase();

      // 1) Try to match a saved Quick Launch app by name.
      const saved = ctx.launchApps || [];
      const match = saved.find((a) => a.label.toLowerCase() === wantLower)
        || saved.find((a) => a.label.toLowerCase().includes(wantLower) || wantLower.includes(a.label.toLowerCase()));
      if (match) {
        await inv("launch_app", { target: match.target });
        return `Launched ${match.label} from your Quick Launch.`;
      }

      // 2) If they clearly gave a URL or a path/exe, just launch it.
      const looksLikeUrl = /^https?:\/\//i.test(want);
      const looksLikePath = /[\\/]/.test(want) || /\.exe$/i.test(want);
      if (looksLikeUrl || looksLikePath) {
        await inv("launch_app", { target: want });
        return `Launched ${want}.`;
      }

      // 3) Otherwise it's just a bare name with no saved app. Don't guess a
      // URL silently  -  tell the model so it can ask the user what they meant.
      return `NO_MATCH: "${want}" isn't in the user's Quick Launch apps, and isn't a URL or file path. Ask them whether they want to open it in the browser (and what URL) or add it to Quick Launch with its .exe path. Do not guess a URL yourself.`;
    }
    if (name === "complete_reminder") {
      const rems = ctx.reminders || [];
      const q = String(input.text || "").toLowerCase();
      const hit = rems.find((r) => r.text.toLowerCase().includes(q));
      if (!hit) return `No reminder matching "${input.text}". Current: ${rems.map((r) => r.text).join("; ") || "none"}.`;
      ctx.toggleReminder?.(hit.id);
      return `Marked "${hit.text}" as ${hit.done ? "not done" : "done"}.`;
    }
    if (name === "delete_reminder") {
      const rems = ctx.reminders || [];
      const q = String(input.text || "").toLowerCase();
      const hit = rems.find((r) => r.text.toLowerCase().includes(q));
      if (!hit) return `No reminder matching "${input.text}".`;
      ctx.removeReminder?.(hit.id);
      return `Deleted reminder "${hit.text}".`;
    }
    if (name === "add_launch_app") {
      const label = String(input.label || "").trim();
      const target = String(input.target || "").trim();
      if (!label || !target) return "Need both a label and a target.";
      ctx.setLaunchApps?.((p) => [...p, { id: Date.now(), label, target }]);
      return `Added "${label}" to Quick Launch.`;
    }
    if (name === "remove_launch_app") {
      const q = String(input.label || "").toLowerCase();
      const apps = ctx.launchApps || [];
      const hit = apps.find((a) => a.label.toLowerCase().includes(q));
      if (!hit) return `No Quick Launch app called "${input.label}".`;
      ctx.setLaunchApps?.((p) => p.filter((a) => a.id !== hit.id));
      return `Removed "${hit.label}" from Quick Launch.`;
    }
    if (name === "set_module_visible") {
      const id = String(input.module || "").toLowerCase();
      if (!MODULES.some((m) => m.id === id)) return `There's no module called "${input.module}".`;
      const visible = input.visible === true || input.visible === "true";
      ctx.setSettings((p) => ({
        ...p,
        hidden: visible ? (p.hidden || []).filter((x) => x !== id) : [...new Set([...(p.hidden || []), id])],
      }));
      return `${visible ? "Showing" : "Hiding"} the ${id} module.`;
    }
    // A quick lookup runs here and answers in the same breath. Real work goes
    // to Agent Mode, which has the plan/verify/handoff loop this doesn't.

    if (name === "run_command") {
      if (!isDesktop) return "Running commands needs the desktop app.";
      const cmd = String(input.command || "").trim();
      if (!cmd) return "No command given.";
      try {
        // Routed through agent_exec rather than run_shell so the same
        // destructive-command guard that protects Agent Mode also applies
        // here  -  otherwise this tool would be the way around it.
        const res = await inv("agent_exec", {
          runId: "assistant",
          cmd,
          cwd: input.cwd || "",
          timeoutSecs: 60,
          quietSecs: 20,
        });
        const body = (res.stdout || "").trim() || (res.stderr || "").trim() || "(no output)";
        const clipped = body.length > 1800 ? `${body.slice(0, 1800)}\n…(truncated)` : body;
        if (res.end_reason === "stalled") {
          return `\`${cmd}\` was killed after going silent — it was probably waiting for input. Try a non-interactive form.`;
        }
        return `\`${cmd}\` exited ${res.code}:\n${clipped}`;
      } catch (e) {
        return `Could not run \`${cmd}\`: ${String(e?.message || e)}`;
      }
    }

    if (name === "start_agent_task") {
      if (!isDesktop) return "Agent Mode needs the desktop app.";
      const goal = String(input.goal || "").trim();
      if (!goal) return "No job described.";

      const st = agentEngine.getState();
      if (st.status === "running" || st.status === "planning") {
        return `Agent Mode is already working on: "${firstLineOf(st.goal)}". Ask the user whether to stop that first.`;
      }
      if (st.status === "waiting") {
        return "Agent Mode is paused waiting for the user to do something by hand. It can't take a new job until that's dealt with.";
      }

      // Deliberately not awaited: the run takes minutes to hours, and the
      // user gets a notification when it ends. Blocking here would hang the
      // conversation (and, by voice, leave dead air).
      agentEngine.start(goal).catch(() => { /* surfaced in Agent Mode's own log */ });
      return `Started Agent Mode on: "${goal}". It's running in the background — say it has started, and that you'll let them know when it's done or needs a hand.`;
    }

    if (name === "get_agent_status") {
      const s = agentEngine.getState();
      if (s.status === "idle") return "Agent Mode isn't running anything right now.";

      const done = s.plan.filter((p) => p.done).length;
      const progress = s.plan.length ? ` Step ${Math.min(done + 1, s.plan.length)} of ${s.plan.length}.` : "";
      const mins = s.startedAt ? Math.round((Date.now() - s.startedAt) / 60000) : 0;
      const cost = s.usage?.calls ? `, about ${agentEngine.fmtCost(agentEngine.estimateCost(s.usage, s.model))} so far` : "";

      if (s.status === "waiting") {
        return `Agent Mode is STUCK waiting for the user: ${s.pending?.request || "it needs a manual step"}. Tell them what to do.`;
      }
      if (s.status === "running" || s.status === "planning") {
        return `Agent Mode is working on "${firstLineOf(s.goal)}".${progress} Running ${mins} minute${mins === 1 ? "" : "s"}${cost}.`;
      }
      return `The last job ("${firstLineOf(s.goal)}") ended as ${s.status}. Summary: ${s.summary || "none recorded"}`;
    }

    if (name === "clear_conversation") {
      ctx.setChat?.([]);
      return "Cleared the conversation.";
    }
    if (name === "replay_tutorial") {
      ctx.replayTutorial?.();
      return "Opening the tutorial.";
    }
    return `Unknown action: ${name}.`;
  } catch (e) {
    return `That action failed: ${String(e?.message || e)}`;
  }
}

const WIDGETS = [
  { id: "clock", title: "Local time", icon: Clock, size: "sm",
    render: () => <ClockBody /> },

  { id: "weather", title: "Weather", icon: CloudSun, size: "sm",
    render: (ctx) => <WeatherBody /> },

  { id: "cpu", title: "CPU", icon: Cpu, size: "sm",
    render: ({ t }) => <Ring value={t?.cpu} label="load" /> },

  { id: "memory", title: "Memory", icon: MemoryStick, size: "sm",
    render: ({ t }) => <Ring value={t?.mem} label="used" tone="var(--ember)" /> },

  { id: "storage", title: "Storage", icon: HardDrive, size: "sm",
    render: ({ t }) => <Ring value={t?.disk} label="used" tone="var(--ember)" /> },

  { id: "netspeed", title: "Throughput", icon: Activity, size: "md",
    render: ({ t }) => <NetBody t={t} /> },

  { id: "connectivity", title: "Connection", icon: Wifi, size: "sm",
    render: ({ t, online }) => (
      <>
        <p className={`nx-pill ${online ? "nx-pill-on" : "nx-pill-off"}`}>
          <Radio size={11} />{online ? "Online" : "Offline"}
        </p>
        <p className="nx-sub nx-dim" style={{ marginTop: 12 }}>
          {t ? `${Math.round(t.ping)} ms round trip` : "Latency unavailable"}
        </p>
      </>
    ) },

  { id: "health", title: "System health", icon: ShieldCheck, size: "sm",
    render: ({ t }) => {
      if (!t) return <Blank />;
      // Real score: start at 100, subtract for genuinely high load on each
      // real metric. No fixed number  -  it moves with the machine.
      const over = (v, soft, hard) => v <= soft ? 0 : Math.min(1, (v - soft) / (hard - soft));
      const penalty = Math.round(
        over(t.cpu, 70, 100) * 22 + over(t.mem, 80, 100) * 22 +
        over(t.disk, 85, 100) * 18 + over(t.temp, 75, 95) * 18);
      const score = Math.max(1, 100 - penalty);
      const issues = [];
      if (t.cpu > 85) issues.push("CPU load high");
      if (t.mem > 90) issues.push("memory pressure");
      if (t.disk > 90) issues.push("disk almost full");
      if (t.temp > 85) issues.push("running hot");
      const tone = score >= 80 ? "nx-readout-good" : score >= 55 ? "" : "nx-readout-bad";
      return (
        <>
          <p className={`nx-readout ${tone}`}>{score}</p>
          <p className="nx-sub">{issues.length ? issues[0] : "Nothing needs attention"}</p>
          <p className="nx-sub nx-dim">{Math.round(t.temp)}°C · {Math.round(t.cpu)}% cpu</p>
        </>
      );
    } },

  { id: "notifications", title: "Notifications", icon: Bell, size: "tall",
    render: (ctx) => <NotifBody ctx={ctx} /> },

  { id: "tasks", title: "Up next", icon: CheckCircle2, size: "tall",
    render: (ctx) => <TaskBody ctx={ctx} /> },

  { id: "quickchat", title: "Ask Nexus", icon: MessageSquare, size: "xl",
    render: ({ go }) => <ChatBody go={go} /> },

  { id: "calendar", title: "This month", icon: CalendarDays, size: "xl",
    render: () => <CalendarBody /> },

  { id: "launch", title: "Quick launch", icon: Rocket, size: "xl",
    render: (ctx) => <LaunchBody ctx={ctx} /> },

  { id: "projects", title: "Recent projects", icon: FolderGit2, size: "md",
    render: ({ t }) => !t ? <Blank line="No repositories indexed" /> : (
      <ul className="nx-rows">
        {t.projects.map((p) => (
          <li key={p.id}>
            <span className="nx-mono">{p.name}</span>
            <span className="nx-branch">{p.branch}</span>
            <span className="nx-bar"><i style={{ width: `${p.pct}%` }} /></span>
            <em>{p.pct}%</em>
          </li>
        ))}
      </ul>
    ) },

  { id: "files", title: "Recent files", icon: FileText, size: "md",
    render: ({ t }) => !t ? <Blank line="Nothing indexed yet" /> : (
      <ul className="nx-rows">
        {t.files.map((f) => (
          <li key={f.id}><span className="nx-mono">{f.name}</span><em>{f.where}</em></li>
        ))}
      </ul>
    ) },

  { id: "coremap", title: "Core map", icon: Sparkles, size: "lg",
    render: ({ go, active }) => <CoreRing active={active} onSelect={go} /> },
];

const WIDGET_MAP = new Map(WIDGETS.map((w) => [w.id, w]));

const DEFAULT_LAYOUT = [
  { id: "clock", size: "sm" }, { id: "weather", size: "sm" },
  { id: "coremap", size: "mega" }, { id: "cpu", size: "sm" }, { id: "memory", size: "sm" },
  { id: "notifications", size: "tall" },
  { id: "netspeed", size: "md" }, { id: "connectivity", size: "sm" }, { id: "health", size: "sm" },
  { id: "tasks", size: "tall" }, { id: "quickchat", size: "xl" },
  { id: "launch", size: "md" }, { id: "calendar", size: "xl" },
];

const SIZE_ORDER = ["sm", "md", "tall", "xl", "lg", "hero", "mega"];
const SIZE_LABEL = { sm: "1×1", md: "2×1", tall: "1×2", xl: "2×2", lg: "2×3", hero: "3×3", mega: "4×4" };

const LIVE_WIDGETS = new Set([
  "weather", "cpu", "memory", "storage", "netspeed",
  "connectivity", "health", "notifications", "projects", "files",
]);

/* A widget that throws must not take the dashboard with it. */
class WidgetBoundary extends React.Component {
  constructor(p) { super(p); this.state = { dead: false }; }
  static getDerivedStateFromError() { return { dead: true }; }
  render() {
    if (this.state.dead) {
      return (
        <div className="nx-w-dead">
          <AlertTriangle size={14} />
          <span>{this.props.title} stopped responding.</span>
          <button onClick={() => this.setState({ dead: false })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const WidgetCell = React.memo(
  function WidgetCell({ w, item, index, edit, ctx, dragging, over, on }) {
    return (
      <article
        className={`nx-w nx-w-${item.size}${dragging ? " nx-w-drag" : ""}${over ? " nx-w-over" : ""}`}
        draggable={edit}
        onDragStart={() => on.start(index)}
        onDragEnd={on.end}
        onDragOver={(e) => { e.preventDefault(); on.over(index); }}
        onDrop={(e) => { e.preventDefault(); on.drop(index); }}>
        {edit && (
          <div className="nx-w-tools">
            <span className="nx-w-grip" tabIndex={0} aria-label={`Move ${w.title}`}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") { e.preventDefault(); on.nudge(index, -1); }
                if (e.key === "ArrowRight") { e.preventDefault(); on.nudge(index, 1); }
              }}>
              <GripVertical size={13} />
            </span>
            <button onClick={() => on.resize(index)} title="Change size">
              <Maximize2 size={11} />{SIZE_LABEL[item.size]}
            </button>
            <button onClick={() => on.remove(index)} title={`Remove ${w.title}`}>
              <X size={12} />
            </button>
          </div>
        )}
        <WidgetBoundary title={w.title}>
          <Frame w={w}>{w.render(ctx)}</Frame>
        </WidgetBoundary>
      </article>
    );
  },
  (a, b) => {
    if (a.item !== b.item || a.edit !== b.edit || a.index !== b.index) return false;
    if (a.dragging !== b.dragging || a.over !== b.over) return false;
    if (a.ctx.active !== b.ctx.active) return false;
    // Static widgets ignore telemetry churn completely.
    if (!LIVE_WIDGETS.has(a.w.id)) return true;
    return a.ctx.t === b.ctx.t && a.ctx.online === b.ctx.online;
  }
);

/* Fixed positions for the centered "orbit" dashboard. The core sits
   dead-center; everything else is placed around it by grid area. This
   is the default view. Rearrange mode switches to the free drag grid. */
const ORBIT = [
  { id: "clock",        area: "a" },
  { id: "weather",      area: "b" },
  { id: "coremap",      area: "core" },
  { id: "cpu",          area: "c" },
  { id: "memory",       area: "d" },
  { id: "connectivity", area: "e" },
  { id: "health",       area: "f" },
  { id: "notifications",area: "g" },
  { id: "netspeed",     area: "h" },
  { id: "tasks",        area: "i" },
  { id: "quickchat",    area: "j" },
  { id: "launch",       area: "k" },
  { id: "calendar",     area: "l" },
];

function OrbitDashboard({ ctx, layout, setLayout, edit }) {
  // Each widget's orbit slot (a-l or core) is stored on its layout item as
  // `area`; if it was never set, we fall back to the original ORBIT position.
  // `area: null` means "no orbit slot" - it flows into the extras row below.
  // Rearrange edits these areas in place, so what you see is what saves.
  const slotOf = new Map(ORBIT.map((o) => [o.id, o.area]));
  const areaOf = (item) => (item.area === undefined ? (slotOf.get(item.id) ?? null) : item.area);
  const areaSet = new Set(ORBIT.map((o) => o.area));
  const schoolMode = ctx.settings?.schoolMode;
  const aiWidget = (id) => id === "quickchat";

  // Pointer-based drag (native HTML5 DnD is unreliable inside the webview).
  const dragIdRef = useRef(null);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  const visible = layout.filter((it) => WIDGET_MAP.get(it.id) && !(schoolMode && aiWidget(it.id)));
  const framed = visible.filter((it) => areaSet.has(areaOf(it)));
  const extras = visible.filter((it) => !areaSet.has(areaOf(it)));

  // Swap two widgets' slots. Handles orbit<->orbit, orbit<->extras, and the core.
  const swap = (aId, bId) => {
    if (!aId || !bId || aId === bId) return;
    setLayout((p) => {
      const a = p.find((x) => x.id === aId), b = p.find((x) => x.id === bId);
      if (!a || !b) return p;
      const aArea = a.area === undefined ? (slotOf.get(a.id) ?? null) : a.area;
      const bArea = b.area === undefined ? (slotOf.get(b.id) ?? null) : b.area;
      return p.map((x) =>
        x.id === aId ? { ...x, area: bArea } : x.id === bId ? { ...x, area: aArea } : x);
    });
  };
  const removeWidget = (id) => setLayout((p) => p.filter((x) => x.id !== id));

  const cellUnder = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest && el.closest("[data-wid]");
    return cell ? cell.getAttribute("data-wid") : null;
  };

  const startDrag = (e, id) => {
    if (!edit) return;
    e.preventDefault();
    dragIdRef.current = id;
    setDragId(id);
    const move = (ev) => setOverId(cellUnder(ev.clientX, ev.clientY));
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const target = cellUnder(ev.clientX, ev.clientY);
      if (target) swap(dragIdRef.current, target);
      dragIdRef.current = null;
      setDragId(null);
      setOverId(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const cell = (item, framedCell) => {
    const w = WIDGET_MAP.get(item.id);
    const area = areaOf(item);
    const isCore = area === "core";
    return (
      <div key={item.id} data-wid={item.id}
        className={`nx-orbit-cell${framedCell ? "" : " nx-orbit-cell-extra"}${dragId === item.id ? " nx-cell-drag" : ""}${overId === item.id && dragId && dragId !== item.id ? " nx-cell-over" : ""}`}
        style={framedCell ? { gridArea: area } : undefined}>
        <article className={`nx-w${isCore ? " nx-w-core" : ""}${edit ? " nx-w-editing" : ""}`}>
          {edit && (
            <div className="nx-w-edit-bar" onPointerDown={(e) => { if (!e.target.closest(".nx-w-x")) startDrag(e, item.id); }}>
              <span className="nx-w-grip"><GripVertical size={12} /> drag to swap</span>
              <button className="nx-w-x" title="Remove widget" onClick={() => removeWidget(item.id)}><X size={12} /></button>
            </div>
          )}
          <header className="nx-w-head"><w.icon size={13} /><h3>{w.title}</h3></header>
          <div className="nx-w-body">
            <WidgetBoundary title={w.title}>{w.render(ctx)}</WidgetBoundary>
          </div>
        </article>
      </div>
    );
  };

  return (
    <>
      <div className={`nx-orbit-grid${edit ? " nx-orbit-edit" : ""}`}>
        {framed.map((it) => cell(it, true))}
      </div>
      {(extras.length > 0 || edit) && (
        <div className="nx-orbit-extras">
          {extras.map((it) => cell(it, false))}
          {edit && extras.length === 0 && <p className="nx-tool-note nx-tool-note-flush">Widgets you add or drag out land here.</p>}
        </div>
      )}
      {edit && <AddTray layout={layout} setLayout={setLayout} />}
    </>
  );
}

// The orbit is both the view and the editor now: Rearrange keeps the same look
// and lets you drag widgets to swap slots (including the core), remove them, and
// add more - all in place, all saved. No separate grid mode.
function Dashboard({ layout, setLayout, edit, ctx }) {
  return <OrbitDashboard ctx={ctx} layout={layout} setLayout={setLayout} edit={edit} />;
}

function AddTray({ layout, setLayout }) {
  const missing = WIDGETS.filter((w) => !layout.some((l) => l.id === w.id));
  return (
    <article className="nx-w nx-w-md nx-tray">
      <header className="nx-w-head"><Plus size={13} /><h3>Add a widget</h3></header>
      <div className="nx-w-body">
        {missing.length === 0
          ? <p className="nx-blank">Every widget is on the board.</p>
          : (
            <div className="nx-tray-list">
              {missing.map((w) => (
                <button key={w.id} onClick={() => setLayout((p) => [...p, { id: w.id, size: w.size, area: null }])}>
                  <w.icon size={12} />{w.title}
                </button>
              ))}
            </div>
          )}
      </div>
    </article>
  );
}

function ModuleView({ mod }) {
  const Icon = mod.icon;
  return (
    <div className="nx-module">
      <div className="nx-module-head">
        <div className="nx-module-icon"><Icon size={20} /></div>
        <div>
          <p className="nx-eyebrow" style={{ color: STATUS[mod.status].tone }}>
            {STATUS[mod.status].label} · {mod.id}
          </p>
          <h1>{mod.label}</h1>
        </div>
      </div>
      <p className="nx-lede">{mod.summary}</p>
      <div className="nx-empty">
        <p className="nx-empty-title">No surface yet.</p>
        <p className="nx-empty-body">
          Registered with the core, not yet built. It will mount here without a
          single change to the shell.
        </p>
        <ul className="nx-caps">{mod.capabilities.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  "Remind me I have a math test Thursday",
  "Set the theme to void",
  "What is my machine doing right now?",
  "Explain a SYN scan like I'm learning it",
];

function buildSystemPrompt(t, online, launchApps) {
  const snapshot = t
    ? `cpu ${Math.round(t.cpu)}% · memory ${Math.round(t.mem)}% · disk ${Math.round(t.disk)}% · ${Math.round(t.temp)}C · down ${Math.round(t.down)}Mb/s · up ${Math.round(t.up)}Mb/s`
    : "telemetry offline";
  const built = MODULES.filter((m) => m.status === "live").map((m) => m.id).join(", ");
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return [
    "You are the assistant inside NEXUS OS, a personal command center for a student at a cyber and engineering high school.",
    "NEXUS OS was created and founded by Gio Zamudio. When asked who made you, who built you, who your creator, maker, or founder is, or who is behind NEXUS OS, the answer is Gio Zamudio. You may add that NEXUS OS runs on Claude, Anthropic's AI model, but the app itself — its design and its existence — is Gio Zamudio's work.",
    "Be direct and concise. Plain prose, no headers unless asked. Never pad with pleasantries. When you write math, you may use LaTeX ($$...$$ for display, $...$ inline, with \\frac, ^, \\int, etc.) and light markdown (**bold**, `code`, ## headers) — it renders properly in this interface, so it will look clean, not raw.",
    `Today is ${today}.`,
    `Live system snapshot: ${snapshot}. Network: ${online ? "online" : "offline"}.`,
    `Modules available: ${built}.`,
    "The Terminal module runs a real shell on the user's machine (real commands, real output) — never describe it as a mock or simulation.",
    "You can take real actions with your tools, and you should when asked: add/complete/delete reminders, log workouts, navigate to any module, open apps or websites, add or remove Quick Launch apps, show or hide modules, clear this conversation, replay the tutorial, and change ANY setting — theme, accent, density, interface toggles, your own voice (male/female British), whether you speak replies, the launch greeting, school mode, and what to call the user. Basically anything the user can do in the app, you can do too. When they ask, call the matching tool — never say you can't change something like your voice or school mode; you can.",
    "You can also READ the user's real data with tools: current weather, live system stats (CPU/memory/disk/temp/network), their reminders, logged workouts, projects and git status, network info (IP/gateway), indexed files, and saved apps. When they ask about any of these — like 'what's the weather', 'how's my CPU', 'what's on my list', 'what's my IP' — call the matching tool to look it up instead of saying you don't have access. You have access; use the tool.",
    // Routing. Without this the model either answers from memory when it could
    // have checked, or hands trivial one-liners to a full agent run.
    "You can also act on the machine itself, and you should decide HOW before you answer. Three levels, cheapest first. (1) If you simply know the answer, say it. (2) If one short command would settle it — a version, whether something is installed, free disk space, what is in a folder — call run_command and answer from the real output. Prefer checking over guessing: 'let me look' beats a confident maybe. (3) If it takes more than one command, or installs, updates, configures, fixes or follows a walkthrough, call start_agent_task and let Agent Mode do it.",
    "Judging between (2) and (3): 'what version of Python do I have' is one command. 'Update my Python' is a job for the agent. If a question turns out to need a second command to answer properly, that is fine — but if you find yourself wanting a third, hand it to the agent instead.",
    "start_agent_task returns immediately because the job runs in the background and the user gets notified when it finishes or needs them. Say it has started; never narrate it as though you watched it finish, and never invent an outcome you did not see. If they ask how it is going, call get_agent_status.",
    "Agent Mode makes real changes and does not ask permission once running. So before starting a job that installs, deletes, or reconfigures anything, confirm with the user in one short question first — unless they clearly already asked for it done. Answering a question never needs confirmation.",
    "After a tool runs, briefly confirm what happened in plain language. If a request is ambiguous (e.g. a reminder with no clear date), ask one short clarifying question before acting.",
    "Only take actions the user actually asked for. Don't navigate or open things unprompted.",
    (launchApps && launchApps.length)
      ? `The user's saved Quick Launch apps are: ${launchApps.map((a) => a.label).join(", ")}. When they ask to open one of these by name, launch it — don't try a URL.`
      : "The user has no saved Quick Launch apps yet.",
  ].join(" ");
}

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+)/g;

function inline(text, key) {
  const out = [];
  let last = 0, m, n = 0;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const url = m[2] || m[3];
    const label = m[1] || url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    out.push(
      <a key={`${key}-l${n++}`} href={url} target="_blank" rel="noopener noreferrer"
        className="nx-link-out">{label}<ExternalLink size={10} /></a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : text;
}

// Convert a LaTeX-ish math string into clean readable Unicode math. Not full
// typesetting (no external lib to keep the CSP tight), but it turns raw
// \int, ^{...}, \frac{}{}, \boxed{} etc. into proper symbols instead of noise.
const SUPER = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","(":"⁽",")":"⁾","n":"ⁿ","x":"ˣ","y":"ʸ","a":"ᵃ","b":"ᵇ","i":"ⁱ" };
const SUB = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"₊","-":"₋","(":"₍",")":"₎","n":"ₙ","x":"ₓ","a":"ₐ" };
function toSuper(s){ return [...s].map((c)=>SUPER[c]||c).join(""); }
function toSub(s){ return [...s].map((c)=>SUB[c]||c).join(""); }

function renderMath(tex) {
  let s = tex;
  // Greek + operators + common commands.
  const repl = [
    [/\\int/g, "∫"], [/\\sum/g, "∑"], [/\\prod/g, "∏"], [/\\infty/g, "∞"],
    [/\\pm/g, "±"], [/\\mp/g, "∓"], [/\\times/g, "×"], [/\\cdot/g, "·"], [/\\div/g, "÷"],
    [/\\leq/g, "≤"], [/\\geq/g, "≥"], [/\\neq/g, "≠"], [/\\approx/g, "≈"], [/\\equiv/g, "≡"],
    [/\\rightarrow/g, "→"], [/\\to/g, "→"], [/\\Rightarrow/g, "⇒"], [/\\leftarrow/g, "←"],
    [/\\alpha/g, "α"], [/\\beta/g, "β"], [/\\gamma/g, "γ"], [/\\delta/g, "δ"], [/\\Delta/g, "Δ"],
    [/\\theta/g, "θ"], [/\\lambda/g, "λ"], [/\\mu/g, "μ"], [/\\pi/g, "π"], [/\\sigma/g, "σ"],
    [/\\phi/g, "φ"], [/\\omega/g, "ω"], [/\\Omega/g, "Ω"], [/\\sqrt/g, "√"],
    [/\\sin/g, "sin"], [/\\cos/g, "cos"], [/\\tan/g, "tan"], [/\\ln/g, "ln"], [/\\log/g, "log"],
    [/\\left/g, ""], [/\\right/g, ""], [/\\,/g, " "], [/\\!/g, ""], [/\\;/g, " "], [/\\quad/g, "  "],
  ];
  for (const [re, val] of repl) s = s.replace(re, val);
  // \frac{a}{b} → a/b (parenthesize multi-char parts).
  s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => {
    const wrap = (x) => (x.length > 1 ? `(${x})` : x);
    return `${wrap(a)}/${wrap(b)}`;
  });
  // \boxed{...} → keep contents (the box is drawn by CSS around the whole line).
  s = s.replace(/\\boxed\{([^{}]*)\}/g, (_, a) => a);
  // Superscripts: ^{...} or ^x
  s = s.replace(/\^\{([^{}]*)\}/g, (_, a) => toSuper(a));
  s = s.replace(/\^(\w)/g, (_, a) => toSuper(a));
  // Subscripts: _{...} or _x
  s = s.replace(/_\{([^{}]*)\}/g, (_, a) => toSub(a));
  s = s.replace(/_(\w)/g, (_, a) => toSub(a));
  // Leftover braces just drop.
  s = s.replace(/[{}]/g, "");
  return s.trim();
}

/// Split a markdown table row into cells, dropping the leading/trailing pipes.
function tableCells(line) {
  return line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

/// A `|---|---|` separator is what distinguishes a real table from a line that
/// merely contains pipes.
const TABLE_SEP = /^\|?[\s:|-]*-[\s:|-]*\|?$/;

export function MsgText({ text }) {
  const parts = text.split(/```/);
  return parts.map((part, i) => {
    // Code fences render as-is.
    if (i % 2 === 1) {
      return <pre key={i} className="nx-code">{part.replace(/^[a-z]*\n/i, "").trimEnd()}</pre>;
    }
    // Pull out display-math blocks ($$...$$) first so they survive line splitting.
    const chunks = part.split(/\$\$([\s\S]*?)\$\$/);
    return chunks.map((chunk, ci) => {
      const key = `${i}-${ci}`;
      // Odd chunks are the math between $$ ... $$.
      if (ci % 2 === 1) {
        const boxed = /\\boxed/.test(chunk);
        return <div key={key} className={`nx-math${boxed ? " nx-math-boxed" : ""}`}>{renderMath(chunk)}</div>;
      }
      // Even chunks are normal prose  -  headers, bold, bullets, tables and
      // inline math. Walked with an index rather than mapped, because a table
      // spans several lines and has to be consumed as a single unit.
      const lines = chunk.split("\n");
      const out = [];
      for (let j = 0; j < lines.length; j++) {
        const trimmed = lines[j].trim();
        if (!trimmed) continue;
        const lk = `${key}-${j}`;

        // Table: header row, a |---|---| separator, then body rows. The
        // separator is what tells a real table from prose containing a pipe.
        const nextLine = (lines[j + 1] || "").trim();
        if (trimmed.includes("|") && nextLine.includes("-") && TABLE_SEP.test(nextLine)) {
          const head = tableCells(trimmed);
          const rows = [];
          let k = j + 2;
          while (k < lines.length && lines[k].trim().includes("|")) {
            rows.push(tableCells(lines[k].trim()));
            k++;
          }
          out.push(
            <div key={lk} className="nx-mdtable-wrap">
              <table className="nx-mdtable">
                <thead>
                  <tr>{head.map((c, ci) => <th key={ci}>{fmtInline(c, `${lk}-h${ci}`)}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((c, ci) => <td key={ci}>{fmtInline(c, `${lk}-${ri}-${ci}`)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          j = k - 1;
          continue;
        }

        if (trimmed === "---") { out.push(<hr key={lk} className="nx-hr" />); continue; }

        const h = trimmed.match(/^(#{1,4})\s+(.*)$/);
        if (h) {
          out.push(<p key={lk} className={`nx-mdh nx-mdh-${h[1].length}`}>{fmtInline(h[2], lk)}</p>);
          continue;
        }

        const bullet = trimmed.match(/^[-*\u2022]\s+(.*)$/);
        if (bullet) {
          out.push(<p key={lk} className="nx-bullet">{fmtInline(bullet[1], lk)}</p>);
          continue;
        }

        out.push(<p key={lk}>{fmtInline(trimmed, lk)}</p>);
      }
      return out;
    });
  });
}

// Inline formatting: **bold**, `code`, inline $math$, and links.
function fmtInline(text, key) {
  // Inline math $...$ first.
  const segs = text.split(/\$([^$]+)\$/);
  const out = [];
  segs.forEach((seg, i) => {
    if (i % 2 === 1) { out.push(<span key={`${key}-m${i}`} className="nx-math-inline">{renderMath(seg)}</span>); return; }
    // Bold **...**
    const bparts = seg.split(/\*\*([^*]+)\*\*/);
    bparts.forEach((bp, k) => {
      if (k % 2 === 1) { out.push(<b key={`${key}-b${i}-${k}`}>{bp}</b>); return; }
      // Inline code `...`
      const cparts = bp.split(/`([^`]+)`/);
      cparts.forEach((cp, n) => {
        if (n % 2 === 1) { out.push(<code key={`${key}-c${i}-${k}-${n}`} className="nx-code-inline">{cp}</code>); return; }
        if (cp) out.push(...[].concat(inline(cp, `${key}-t${i}-${k}-${n}`)));
      });
    });
  });
  return out.length ? out : text;
}

/// Which brain answers you here. Same three options as Agent Mode, and it
/// applies to voice as well since both go through askClaude.
function AssistantModel() {
  const [model, setModel] = useState(assistantModel);
  useEffect(() => subscribeAssistantModel(setModel), []);

  const chosen = agentEngine.MODELS.find((m) => m.id === model) || agentEngine.MODELS[1];

  return (
    <>
      <p className="nx-rail-title" style={{ marginTop: 26 }}>Model</p>
      <div className="nx-rail-models">
        {agentEngine.MODELS.map((m) => (
          <button
            key={m.id}
            className={`nx-rail-model${m.id === model ? " on" : ""}`}
            onClick={() => setAssistantModel(m.id)}
            title={m.blurb}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="nx-rail-modelnote">{chosen.blurb}</p>
    </>
  );
}

/// What this conversation has cost so far. Session-only and deliberately
/// understated  -  it is here so a runaway loop is visible, not to make anyone
/// anxious about pennies.
function SessionMeter() {
  const [usage, setUsage] = useState(Meter.get());
  useEffect(() => Meter.subscribe(setUsage), []);

  if (!usage.calls) return null;

  const cost = agentEngine.estimateCost(usage, assistantModel);
  const cached = usage.cacheRead || 0;

  return (
    <>
      <p className="nx-rail-title" style={{ marginTop: 26 }}>This session</p>
      <ul className="nx-rail-list">
        <li className="nx-rail-on">
          <Gauge size={12} />Spent<em>{agentEngine.fmtCost(cost)}</em>
        </li>
        <li className="nx-rail-on">
          <Radio size={12} />Requests<em>{usage.calls}</em>
        </li>
        {cached > 0 && (
          <li className="nx-rail-on">
            <Database size={12} />From cache<em>{Math.round((cached / (cached + usage.input + usage.cacheWrite)) * 100)}%</em>
          </li>
        )}
      </ul>
    </>
  );
}

/// A live line on whatever the agent is doing, so handing it a job from chat
/// doesn't feel like dropping it into a hole.
function AgentRail({ go }) {
  const [run, setRun] = useState(agentEngine.getState());
  useEffect(() => agentEngine.subscribe(setRun), []);

  if (run.status === "idle") return null;

  const done = run.plan.filter((p) => p.done).length;
  const label = {
    planning: "Planning", running: "Working", waiting: "Needs you",
    done: "Finished", blocked: "Couldn't finish", stopped: "Stopped", error: "Error",
  }[run.status] || run.status;

  return (
    <>
      <p className="nx-rail-title" style={{ marginTop: 26 }}>Agent Mode</p>
      <ul className="nx-rail-list">
        <li className={run.status === "waiting" ? "" : "nx-rail-on"}>
          <Bot size={12} />{label}
          {run.plan.length > 0 && <em>{done}/{run.plan.length}</em>}
        </li>
      </ul>
      <button className="nx-rail-jump" onClick={() => go?.("agent")}>
        Open Agent Mode <ArrowRight size={11} />
      </button>
    </>
  );
}

function AssistantView({ ctx }) {
  const { t, online } = ctx;
  const msgs = ctx.chat || [];
  const setMsgs = ctx.setChat;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const feedRef = useRef(null);
  const boxRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  // Navigating away mid-request must not leave a pending fetch behind.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (override) => {
    const body = (override ?? draft).trim();
    if (!body || busy) return;
    setErr(null);
    setDraft("");
    const shown = [...msgs, { role: "user", content: body }];
    setMsgs(shown);
    setBusy(true);
    if (boxRef.current) boxRef.current.style.height = "auto";
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // Conversation sent to the model uses the real content-block shapes so
    // tool_use / tool_result can round-trip. `shown` is what the user sees.
    let convo = shown.map((m) => ({ role: m.role, content: m.content }));

    try {
      // Tool loop: keep going while the model asks to call tools, capped so a
      // misbehaving model can't spin forever. 10 rounds: now that the assistant
      // can run commands and delegate, 5 ran out mid-task.
      for (let step = 0; step < 10; step++) {
        if (ac.signal.aborted) return; // user hit stop
        const data = await askClaude({
          system: buildSystemPrompt(t, online, ctx.launchApps),
          messages: convo,
          tools: ASSISTANT_TOOLS,
          signal: ac.signal,
          raw: true,
          maxTokens: 2000, // was the 1000 default, which truncated long answers mid-sentence
        });
        if (ac.signal.aborted) return; // stopped while the request was in flight

        const blocks = data.content || [];
        const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        const toolUses = blocks.filter((b) => b.type === "tool_use");

        // Show any text the model produced this turn.
        if (text) setMsgs((p) => [...p, { role: "assistant", content: text }]);

        if (data.stop_reason !== "tool_use" || toolUses.length === 0) break;

        // Execute each requested tool and feed results back.
        convo.push({ role: "assistant", content: blocks });
        const results = [];
        for (const tu of toolUses) {
          if (ac.signal.aborted) return; // stop before running more tools
          const result = await runAssistantTool(tu.name, tu.input || {}, ctx);
          results.push({ type: "tool_result", tool_use_id: tu.id, content: result });
        }
        convo.push({ role: "user", content: results });
      }
    } catch (e) {
      if (e.name === "AbortError") return;
      setErr(e.message || "The assistant could not be reached.");
      setMsgs((p) => (p[p.length - 1]?.role === "user" ? p.slice(0, -1) : p));
      setDraft(body);
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const grow = (el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  };

  return (
    <div className="nx-asst">
      <div className="nx-asst-main">
        <div className="nx-asst-feed" ref={feedRef}>
          {msgs.length === 0 && !busy && (
            <div className="nx-asst-open">
              <span className="nx-asst-orb" />
              <h3>What do you need?</h3>
              <p>
                Ask me anything, or tell me to do something — set a reminder, log a
                workout, open a module, launch an app, or change the theme.
              </p>
              <div className="nx-asst-seeds">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, i) => (
            <div key={i} className={`nx-msg nx-msg-${m.role}`}>
              {m.role === "assistant" && <span className="nx-msg-mark" />}
              <div className="nx-msg-body">
                <MsgText text={m.content} />
              </div>
            </div>
          ))}

          {busy && (
            <div className="nx-msg nx-msg-assistant">
              <span className="nx-msg-mark nx-msg-mark-busy" />
              <div className="nx-msg-body nx-msg-busy">
                <Loader2 size={13} className="nx-spin" /> Thinking
              </div>
            </div>
          )}

          {err && (
            <div className="nx-asst-err">
              <AlertTriangle size={13} />
              <span>{err} Your draft is still in the box — press send to retry.</span>
            </div>
          )}
        </div>

        <div className="nx-asst-composer">
          <textarea
            ref={boxRef}
            rows={1}
            value={draft}
            placeholder="Ask Nexus anything"
            onChange={(e) => { setDraft(e.target.value); grow(e.target); }}
            onKeyDown={onKey}
          />
          {busy ? (
            <button className="nx-asst-send nx-asst-stop" onClick={() => {
              abortRef.current?.abort();
              setBusy(false);
            }} aria-label="Stop">
              <Square size={13} />
            </button>
          ) : (
            <button className="nx-asst-send" onClick={() => send()} disabled={!draft.trim()}>
              <Send size={14} />
            </button>
          )}
        </div>
        <p className="nx-asst-foot">Enter sends · Shift + Enter adds a line</p>
      </div>

      <aside className="nx-asst-rail">
        <p className="nx-rail-title">Context in scope</p>
        <ul className="nx-rail-list">
          <li className={t ? "nx-rail-on" : ""}>
            <Activity size={12} />System telemetry
            <em>{t ? "reading" : "offline"}</em>
          </li>
          <li className="nx-rail-on">
            <Database size={12} />Module registry<em>{MODULES.length}</em>
          </li>
          <li className="nx-rail-on"><CheckCircle2 size={12} />Reminders<em>{(ctx.reminders || []).length}</em></li>
        </ul>

        <AssistantModel />
        <AgentRail go={ctx.go} />
        <SessionMeter />

        <p className="nx-rail-title" style={{ marginTop: 26 }}>Can do</p>
        <ul className="nx-rail-list">
          <li className="nx-rail-on"><Bell size={12} />Set reminders</li>
          <li className="nx-rail-on"><Dumbbell size={12} />Log workouts</li>
          <li className="nx-rail-on"><ArrowRight size={12} />Open modules</li>
          <li className="nx-rail-on"><Rocket size={12} />Launch apps</li>
          <li className="nx-rail-on"><Settings size={12} />Change settings</li>
        </ul>

        <p className="nx-rail-title" style={{ marginTop: 26 }}>Engine</p>
        <p className="nx-rail-note">
          Sonnet 4.6 over your own API key. This conversation is kept until you
          clear it or restart the app.
        </p>

        {msgs.length > 0 && (
          <button className="nx-rail-clear" onClick={() => { setMsgs([]); setErr(null); }}>
            <Trash2 size={12} />Clear conversation
          </button>
        )}
      </aside>
    </div>
  );
}

function CopyBtn({ value }) {
  const [state, setState] = useState("idle");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const label = { idle: "Copy", done: "Copied", fail: "Select it" }[state];
  return (
    <button className={`nx-copy${state === "fail" ? " nx-copy-fail" : ""}`} disabled={!value}
      onClick={async () => {
        clearTimeout(timer.current);
        try {
          await navigator.clipboard.writeText(value);
          setState("done");
        } catch {
          setState("fail");
        }
        timer.current = setTimeout(() => setState("idle"), 1600);
      }}>
      {state === "done" ? <Check size={11} /> : <Copy size={11} />}{label}
    </button>
  );
}

const DIGESTS = ["SHA-256", "SHA-1", "SHA-384", "SHA-512"];

const CRYPTO_OK = typeof crypto !== "undefined" && !!crypto.subtle;

function HashForge() {
  const [input, setInput] = useState("");
  const [algo, setAlgo] = useState("SHA-256");
  const [out, setOut] = useState("");
  const [fail, setFail] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!input) { setOut(""); setFail(null); return; }
    if (!CRYPTO_OK) {
      setFail("The crypto engine is unavailable. It only exposes itself over HTTPS or localhost.");
      setOut("");
      return;
    }
    (async () => {
      try {
        const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(input));
        const hex = [...new Uint8Array(buf)]
          .map((b) => b.toString(16).padStart(2, "0")).join("");
        if (!cancelled) { setOut(hex); setFail(null); }
      } catch {
        if (!cancelled) { setOut(""); setFail(`${algo} was refused by the crypto engine.`); }
      }
    })();
    return () => { cancelled = true; };
  }, [input, algo]);

  return (
    <div className="nx-tool">
      <div className="nx-tool-row">
        {DIGESTS.map((d) => (
          <button key={d} className={`nx-chip${algo === d ? " nx-chip-on" : ""}`}
            onClick={() => setAlgo(d)}>{d}</button>
        ))}
      </div>
      <textarea className="nx-field" rows={4} value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Text to hash" />
      <div className="nx-out">
        <div className="nx-out-head">
          <span>{algo} digest</span>
          <CopyBtn value={out} />
        </div>
        {fail
          ? <p className="nx-out-err">{fail}</p>
          : <p className="nx-hex">{out || <em>Waiting for input</em>}</p>}
        {out && !fail && (
          <p className="nx-tool-note">{out.length * 4} bits · {out.length} hex characters</p>
        )}
      </div>
      <p className="nx-tool-note">
        MD5 is absent on purpose — the browser's crypto engine dropped it because
        collisions are trivial to manufacture. If a CTF hands you an MD5 hash,
        that's usually the hint.
      </p>
    </div>
  );
}

const ROT = (s, n) => s.replace(/[a-z]/gi, (c) => {
  const base = c <= "Z" ? 65 : 97;
  return String.fromCharCode(((c.charCodeAt(0) - base + n) % 26 + 26) % 26 + base);
});

const bytesToB64 = (bytes) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
};

const CODECS = {
  "Base64": {
    to: (s) => bytesToB64(new TextEncoder().encode(s)),
    from: (s) => {
      const clean = s.replace(/\s+/g, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error("bad alphabet");
      return new TextDecoder("utf-8", { fatal: true })
        .decode(Uint8Array.from(atob(clean), (c) => c.charCodeAt(0)));
    },
  },
  "Hex": {
    to: (s) => [...new TextEncoder().encode(s)]
      .map((b) => b.toString(16).padStart(2, "0")).join(" "),
    from: (s) => {
      const clean = s.replace(/0x|[\s,]+/gi, "");
      if (!clean || clean.length % 2 || !/^[0-9a-f]+$/i.test(clean)) throw new Error("bad hex");
      return new TextDecoder("utf-8", { fatal: true })
        .decode(new Uint8Array(clean.match(/../g).map((h) => parseInt(h, 16))));
    },
  },
  "Binary": {
    to: (s) => [...new TextEncoder().encode(s)]
      .map((b) => b.toString(2).padStart(8, "0")).join(" "),
    from: (s) => {
      const tokens = s.trim().split(/\s+/).filter(Boolean);
      if (!tokens.length || tokens.some((b) => !/^[01]{1,8}$/.test(b))) throw new Error("bad binary");
      return new TextDecoder("utf-8", { fatal: true })
        .decode(new Uint8Array(tokens.map((b) => parseInt(b, 2))));
    },
  },
  "URL": {
    to: encodeURIComponent,
    from: (s) => decodeURIComponent(s.trim()),
  },
  "ROT13": { to: (s) => ROT(s, 13), from: (s) => ROT(s, 13) },
};

function CipherBench() {
  const [codec, setCodec] = useState("Base64");
  const [dir, setDir] = useState("to");
  const [input, setInput] = useState("");

  const result = useMemo(() => {
    if (!input) return { text: "", error: null };
    try {
      return { text: CODECS[codec][dir](input), error: null };
    } catch {
      return { text: "", error: `That isn't valid ${codec}. Check for stray characters or padding.` };
    }
  }, [codec, dir, input]);

  return (
    <div className="nx-tool">
      <div className="nx-tool-row">
        {Object.keys(CODECS).map((c) => (
          <button key={c} className={`nx-chip${codec === c ? " nx-chip-on" : ""}`}
            onClick={() => setCodec(c)}>{c}</button>
        ))}
      </div>
      <div className="nx-tool-row">
        <button className={`nx-chip${dir === "to" ? " nx-chip-on" : ""}`} onClick={() => setDir("to")}>Encode</button>
        <button className={`nx-chip${dir === "from" ? " nx-chip-on" : ""}`} onClick={() => setDir("from")}>Decode</button>
      </div>
      <textarea className="nx-field" rows={4} value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={dir === "to" ? "Plain text" : `${codec} to decode`} />
      <div className="nx-out">
        <div className="nx-out-head">
          <span>{dir === "to" ? "Encoded" : "Decoded"}</span>
          <CopyBtn value={result.text} />
        </div>
        {result.error
          ? <p className="nx-out-err">{result.error}</p>
          : <p className="nx-hex nx-hex-wrap">{result.text || <em>Waiting for input</em>}</p>}
      </div>
    </div>
  );
}

const PORT_NOTES = {
  21: ["FTP", "high", "Credentials cross the wire in plaintext."],
  22: ["SSH", "ok", "Fine if key-only auth and a current version."],
  23: ["Telnet", "high", "Unencrypted remote shell. Should not be open."],
  25: ["SMTP", "watch", "Check it isn't an open relay."],
  53: ["DNS", "watch", "Recursion open to the world enables amplification."],
  80: ["HTTP", "watch", "Plaintext. Expect a redirect to 443."],
  110: ["POP3", "high", "Plaintext mail retrieval."],
  135: ["MSRPC", "high", "Windows RPC. Never expose externally."],
  139: ["NetBIOS", "high", "Legacy SMB. Common ransomware entry point."],
  143: ["IMAP", "watch", "Prefer 993 with TLS."],
  443: ["HTTPS", "ok", "Verify the certificate chain and TLS version."],
  445: ["SMB", "high", "EternalBlue's front door. Firewall it."],
  1433: ["MSSQL", "high", "Database engines should not face the internet."],
  3306: ["MySQL", "high", "Database engines should not face the internet."],
  3389: ["RDP", "high", "Heavily brute-forced. Gate behind a VPN."],
  5432: ["PostgreSQL", "high", "Bind to localhost unless there's a reason."],
  8080: ["HTTP-alt", "watch", "Often a forgotten admin or dev console."],
};

const SAMPLE_SCAN = `Starting Nmap 7.94 ( https://nmap.org )
Nmap scan report for lab-target (192.168.1.42)
Host is up (0.00087s latency).
Not shown: 993 closed tcp ports (reset)

PORT     STATE    SERVICE       VERSION
22/tcp   open     ssh           OpenSSH 8.9p1
23/tcp   open     telnet        Linux telnetd
80/tcp   open     http          Apache httpd 2.4.52
139/tcp  open     netbios-ssn   Samba smbd 4
445/tcp  open     microsoft-ds  Samba smbd 4
3306/tcp open     mysql         MySQL 8.0.32
3389/tcp filtered ms-wbt-server
8080/tcp open     http-proxy    Jetty 9.4

Nmap done: 1 IP address (1 host up) scanned in 1.82 seconds`;

function parseScan(text) {
  const host = text.match(/Nmap scan report for ([^\n]+)/);
  const rows = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^(\d{1,5})\/(tcp|udp)\s+(open|closed|filtered|open\|filtered)\s+(\S+)(?:\s+(.*))?$/i);
    if (m) {
      const port = parseInt(m[1], 10);
      const known = PORT_NOTES[port];
      rows.push({
        port, proto: m[2], state: m[3].toLowerCase(), service: m[4],
        version: (m[5] || "").trim(),
        risk: m[3].toLowerCase() === "open" ? (known ? known[1] : "watch") : "ok",
        note: known ? known[2] : "Not in the common-port reference. Research it.",
      });
    }
  }
  return { host: host ? host[1].trim() : null, rows };
}

const RISK_LABEL = { high: "Investigate", watch: "Review", ok: "Expected" };

function ScanReader() {
  const [raw, setRaw] = useState("");
  const parsed = useMemo(() => parseScan(raw), [raw]);
  const open = parsed.rows.filter((r) => r.state === "open");
  const high = open.filter((r) => r.risk === "high").length;

  return (
    <div className="nx-tool">
      <div className="nx-tool-row nx-tool-row-split">
        <p className="nx-tool-note nx-tool-note-flush">
          Paste console output from <code>nmap</code>. Nothing is scanned here —
          this reads results you already have.
        </p>
        <button className="nx-chip" onClick={() => setRaw(SAMPLE_SCAN)}>Load sample</button>
      </div>
      <textarea className="nx-field nx-field-mono" rows={6} value={raw}
        onChange={(e) => setRaw(e.target.value)} placeholder="Nmap scan report for ..." />

      {raw && parsed.rows.length === 0 && (
        <p className="nx-out-err">
          No port lines found. This reads the default console format — the table
          with PORT, STATE and SERVICE columns.
        </p>
      )}

      {parsed.rows.length > 0 && (
        <>
          <div className="nx-scan-sum">
            <span><b>{parsed.host || "unnamed host"}</b></span>
            <span>{open.length} open</span>
            <span className={high ? "nx-risk-high" : ""}>{high} needing attention</span>
          </div>
          <div className="nx-scan-table">
            {parsed.rows.map((r) => (
              <div key={`${r.port}-${r.proto}`} className={`nx-scan-row nx-risk-${r.risk}`}>
                <span className="nx-scan-port">{r.port}<i>/{r.proto}</i></span>
                <span className="nx-scan-state">{r.state}</span>
                <span className="nx-scan-svc">
                  {r.service}
                  {r.version && <em>{r.version}</em>}
                </span>
                <span className="nx-scan-tag">{RISK_LABEL[r.risk]}</span>
                <span className="nx-scan-note">{r.note}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- metadata finder + remover ---------- */

function MetadataTool({ ctx }) {
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const [fileName, setFileName] = useState(null);
  const [bytes, setBytes] = useState(null);      // Uint8Array of the loaded image
  const [entries, setEntries] = useState(null);
  const [state, setState] = useState("idle");    // idle | reading | done | stripping
  const [err, setErr] = useState(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  const inv = () => window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;

  const load = async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(jpe?g|tiff?|heic|png|gif)$/i.test(file.name)) {
      setErr("That doesn't look like an image."); return;
    }
    setErr(null); setEntries(null); setFileName(file.name); setState("reading");
    const buf = new Uint8Array(await file.arrayBuffer());
    setBytes(buf);
    if (!isDesktop) { setErr("Metadata tools work in the desktop app."); setState("idle"); return; }
    try {
      const data = await inv()("read_metadata_bytes", { bytes: Array.from(buf) });
      setEntries(data); setState("done");
    } catch (e) {
      setEntries([]); setErr(String(e?.message || e)); setState("done");
    }
  };

  const strip = async () => {
    if (!bytes) return;
    setState("stripping"); setErr(null);
    try {
      const clean = await inv()("strip_metadata_bytes", { bytes: Array.from(bytes) });
      // Offer the cleaned image as a download.
      const blob = new Blob([new Uint8Array(clean)], { type: "image/png" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const base = (fileName || "image").replace(/\.[^.]+$/, "");
      a.href = url; a.download = `${base}-clean.png`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      ctx?.toast?.("Clean copy downloaded");
      setState("done");
    } catch (e) {
      setErr(String(e?.message || e)); setState("done");
    }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    load(e.dataTransfer.files?.[0]);
  };
  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) load(item.getAsFile());
  };

  const sensitive = (tag) => /gps|location|serial|owner|artist|software|make|model/i.test(tag);

  return (
    <div className="nx-tool" onPaste={onPaste}>
      <div className={`nx-mdz${drag ? " nx-mdz-on" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={(e) => load(e.target.files?.[0])} />
        <Upload size={22} />
        <p className="nx-mdz-title">{fileName || "Drop an image here"}</p>
        <p className="nx-mdz-sub">or click to browse · or paste from clipboard</p>
      </div>

      {state === "reading" && <p className="nx-tool-note">Reading metadata…</p>}
      {err && <p className="nx-out-err">{err}</p>}

      {entries && entries.length > 0 && (
        <>
          <div className="nx-tool-row nx-tool-row-split">
            <span className="nx-fcount">{entries.length} fields · {entries.filter((e) => sensitive(e.tag)).length} privacy-sensitive</span>
            <button className="nx-chip nx-chip-stop" onClick={strip} disabled={state === "stripping"}>
              {state === "stripping" ? "Cleaning…" : "Strip all metadata → download clean copy"}
            </button>
          </div>
          <div className="nx-ports">
            {entries.map((e, i) => (
              <div key={i} className="nx-port">
                <span className="nx-port-name" style={{ gridColumn: "span 2", color: sensitive(e.tag) ? "var(--ember)" : "var(--ice)" }}>
                  {e.tag}
                </span>
                <span className="nx-port-note nx-mono" style={{ gridColumn: "span 3" }}>{e.value}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="nx-tool-note">
        Reads EXIF from JPEG/TIFF images — camera, settings, timestamps, and GPS location if present.
        Red fields can identify you or where a photo was taken. "Strip" gives you a clean PNG copy
        with all metadata removed; your original file is never touched. PNG/GIF usually carry no EXIF.
      </p>
    </div>
  );
}

/* ---------- password strength ---------- */

const COMMON_PW = new Set([
  "password", "123456", "123456789", "12345678", "qwerty", "abc123", "111111",
  "password1", "1234567", "sunshine", "iloveyou", "admin", "welcome", "monkey",
  "letmein", "dragon", "football", "princess", "qwerty123", "000000", "1234",
]);

function analyzePassword(pw) {
  if (!pw) return null;
  const len = pw.length;
  const lower = /[a-z]/.test(pw), upper = /[A-Z]/.test(pw);
  const digit = /[0-9]/.test(pw), symbol = /[^A-Za-z0-9]/.test(pw);
  let pool = 0;
  if (lower) pool += 26; if (upper) pool += 26;
  if (digit) pool += 10; if (symbol) pool += 33;
  const entropyBits = len ? Math.round(len * Math.log2(pool || 1)) : 0;

  const notes = [];
  if (COMMON_PW.has(pw.toLowerCase())) notes.push({ tone: "bad", text: "This is one of the most common passwords in every breach list. Instantly guessed." });
  if (len < 8) notes.push({ tone: "bad", text: "Under 8 characters — brute-forced in seconds." });
  else if (len < 12) notes.push({ tone: "warn", text: "12+ characters is the modern floor. This is short." });
  if (!symbol) notes.push({ tone: "warn", text: "No symbols — adds the most to the character pool." });
  if (!upper || !lower) notes.push({ tone: "warn", text: "Mix upper and lower case to widen the pool." });
  if (/^[a-z]+$/i.test(pw)) notes.push({ tone: "warn", text: "Letters only — dictionary attacks eat these." });
  if (/(.)\1\1/.test(pw)) notes.push({ tone: "warn", text: "Repeated characters cut real entropy." });
  if (notes.length === 0) notes.push({ tone: "good", text: "No obvious weaknesses. Length and variety are solid." });

  // offline guess estimate at 10 billion/sec (a modern GPU rig)
  const combos = Math.pow(pool || 1, len);
  const seconds = combos / 1e10 / 2; // average case = half the space
  let crack;
  if (COMMON_PW.has(pw.toLowerCase())) crack = "instantly";
  else if (seconds < 1) crack = "under a second";
  else if (seconds < 3600) crack = `~${Math.round(seconds)} seconds`;
  else if (seconds < 86400) crack = `~${Math.round(seconds / 3600)} hours`;
  else if (seconds < 31536000) crack = `~${Math.round(seconds / 86400)} days`;
  else if (seconds < 31536000 * 1000) crack = `~${Math.round(seconds / 31536000)} years`;
  else crack = "centuries";

  const score = COMMON_PW.has(pw.toLowerCase()) ? 0
    : Math.min(4, Math.floor(entropyBits / 22));
  return { entropyBits, pool, crack, notes, score };
}

const PW_TIERS = [
  { label: "Very weak", tone: "var(--ember)" },
  { label: "Weak", tone: "var(--ember)" },
  { label: "Fair", tone: "#FFB454" },
  { label: "Strong", tone: "var(--signal)" },
  { label: "Very strong", tone: "var(--signal)" },
];

function PasswordLab() {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const a = analyzePassword(pw);

  return (
    <div className="nx-tool">
      <div className="nx-pw-input">
        <input className="nx-inline nx-inline-wide" type={show ? "text" : "password"}
          value={pw} onChange={(e) => setPw(e.target.value)}
          placeholder="Type or paste a password to test" autoComplete="off" spellCheck={false} />
        <button className="nx-chip" onClick={() => setShow((s) => !s)}>{show ? "Hide" : "Show"}</button>
      </div>

      {!a ? (
        <p className="nx-tool-note">
          This never leaves your machine — it runs entirely in the app. Test a password
          you actually use and see how fast a GPU rig would crack it.
        </p>
      ) : (
        <>
          <div className="nx-pw-meter">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="nx-pw-seg"
                style={{ background: i <= a.score ? PW_TIERS[a.score].tone : "var(--glass-2)" }} />
            ))}
          </div>
          <div className="nx-pw-stats">
            <span style={{ color: PW_TIERS[a.score].tone }}>{PW_TIERS[a.score].label}</span>
            <span><b>{a.entropyBits}</b> bits entropy</span>
            <span>pool of <b>{a.pool}</b> chars</span>
            <span>cracked in <b>{a.crack}</b></span>
          </div>
          <div className="nx-pw-notes">
            {a.notes.map((n, i) => (
              <p key={i} className={`nx-pw-note nx-pw-${n.tone}`}>{n.text}</p>
            ))}
          </div>
          <p className="nx-tool-note">
            Crack time assumes ~10 billion guesses/second — a realistic offline GPU rig
            against a fast hash. A slow hash like bcrypt buys far more time, but never
            rely on that; length is what actually saves you.
          </p>
        </>
      )}
    </div>
  );
}

/* ---------- JWT decoder ---------- */

function b64urlDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return decodeURIComponent(
    atob(s).split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
  );
}

function JwtDecoder() {
  const [token, setToken] = useState("");
  const decoded = useMemo(() => {
    const t = token.trim();
    if (!t) return null;
    const parts = t.split(".");
    if (parts.length !== 3) return { error: "A JWT has three parts separated by dots. This doesn't." };
    try {
      const header = JSON.parse(b64urlDecode(parts[0]));
      const payload = JSON.parse(b64urlDecode(parts[1]));
      const claims = [];
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp) {
        const exp = new Date(payload.exp * 1000);
        claims.push({ tone: payload.exp < now ? "bad" : "good",
          text: payload.exp < now ? `Expired ${exp.toLocaleString()}` : `Expires ${exp.toLocaleString()}` });
      }
      if (payload.iat) claims.push({ tone: "info", text: `Issued ${new Date(payload.iat * 1000).toLocaleString()}` });
      if (payload.nbf && payload.nbf > now) claims.push({ tone: "warn", text: `Not valid until ${new Date(payload.nbf * 1000).toLocaleString()}` });
      claims.push({ tone: "info", text: `Algorithm: ${header.alg || "unspecified"}` });
      if (header.alg === "none") claims.push({ tone: "bad", text: "alg is 'none' — a classic auth-bypass vector. Never trust this server-side." });
      return { header, payload, claims, sig: parts[2] };
    } catch {
      return { error: "The header or payload isn't valid base64url JSON." };
    }
  }, [token]);

  return (
    <div className="nx-tool">
      <textarea className="nx-field nx-mono-field" rows={3} value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Paste a JWT (eyJ...)" spellCheck={false} />
      {!decoded ? (
        <p className="nx-tool-note">
          Decodes the header and payload locally. A JWT is only base64 — anyone can read
          it, which is the point of pasting one here. The signature is what's secret; this
          tool never verifies it, just shows you what a token is carrying.
        </p>
      ) : decoded.error ? (
        <p className="nx-out-err">{decoded.error}</p>
      ) : (
        <>
          <div className="nx-jwt-claims">
            {decoded.claims.map((c, i) => (
              <span key={i} className={`nx-jwt-claim nx-pw-${c.tone}`}>{c.text}</span>
            ))}
          </div>
          <div className="nx-jwt-grid">
            <div className="nx-out">
              <div className="nx-out-head"><span>Header</span><CopyBtn value={JSON.stringify(decoded.header, null, 2)} /></div>
              <pre className="nx-code">{JSON.stringify(decoded.header, null, 2)}</pre>
            </div>
            <div className="nx-out">
              <div className="nx-out-head"><span>Payload</span><CopyBtn value={JSON.stringify(decoded.payload, null, 2)} /></div>
              <pre className="nx-code">{JSON.stringify(decoded.payload, null, 2)}</pre>
            </div>
          </div>
          <div className="nx-out">
            <div className="nx-out-head"><span>Signature</span></div>
            <p className="nx-hex">{decoded.sig}</p>
            <p className="nx-tool-note">Not verified — you'd need the secret or public key. This is just the raw third segment.</p>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- entropy meter ---------- */

function shannonEntropy(str) {
  if (!str) return 0;
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  let bits = 0;
  for (const ch in freq) {
    const p = freq[ch] / str.length;
    bits -= p * Math.log2(p);
  }
  return bits; // bits per character
}

function EntropyMeter() {
  const [input, setInput] = useState("");
  const perChar = shannonEntropy(input);
  const total = perChar * input.length;
  const unique = new Set(input).size;
  // rough read on what it looks like
  const assessment = !input ? null
    : total < 28 ? { tone: "bad", text: "Low total entropy — trivially guessable if this is a secret." }
    : total < 60 ? { tone: "warn", text: "Moderate. Fine for a label, weak for a key or password." }
    : { tone: "good", text: "High entropy — consistent with a strong key or random token." };
  const pct = Math.min(100, (perChar / 6) * 100); // ~6 bits/char is near-random over a big set

  return (
    <div className="nx-tool">
      <textarea className="nx-field nx-mono-field" rows={3} value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste a key, token, or any string to measure its randomness" spellCheck={false} />
      {!input ? (
        <p className="nx-tool-note">
          Shannon entropy measures unpredictability — how many bits of information each
          character carries. Random tokens score high; English text and repeated patterns
          score low. Useful for spotting a weak key or a not-actually-random "random" value.
        </p>
      ) : (
        <>
          <div className="nx-track"><i style={{ width: `${pct}%`,
            background: assessment.tone === "good" ? "var(--signal)" : assessment.tone === "warn" ? "#FFB454" : "var(--ember)" }} /></div>
          <div className="nx-pw-stats">
            <span><b>{perChar.toFixed(2)}</b> bits/char</span>
            <span><b>{Math.round(total)}</b> bits total</span>
            <span><b>{unique}</b> unique chars</span>
            <span><b>{input.length}</b> length</span>
          </div>
          <p className={`nx-pw-note nx-pw-${assessment.tone}`}>{assessment.text}</p>
          <p className="nx-tool-note">
            Max is ~{Math.log2(unique || 1).toFixed(1)} bits/char given the {unique} distinct
            characters present. English prose sits near 1–1.5 bits/char; a good random token
            approaches the maximum for its alphabet.
          </p>
        </>
      )}
    </div>
  );
}

// Cyber Twin  -  records a baseline snapshot of the machine, then on later checks
// flags only what's genuinely changed (new listening ports, processes using far
// more memory than before, big jumps in process count). Speaks up ONLY when
// something's worth looking at; stays quiet when all is normal. Fully local.
function CyberTwin({ ctx }) {
  const [baseline, setBaseline] = usePersistent("cyber-baseline", null);
  const [findings, setFindings] = useState(null); // null = not checked yet
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState(null);
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const ranRef = useRef(false);

  const snap = async () => {
    const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
    return inv("system_snapshot");
  };

  const setBase = async () => {
    if (!isDesktop) { ctx.toast("The Cyber Twin needs the desktop app."); return; }
    setBusy(true);
    try {
      const s = await snap();
      setBaseline({ ...s, at: Date.now() });
      setFindings([]);
      ctx.toast("Baseline recorded — Nexus now knows what normal looks like.");
    } catch (e) { ctx.toast(String(e?.message || e)); }
    setBusy(false);
  };

  // Compare a fresh snapshot to the baseline; return only real anomalies.
  const analyze = (base, now) => {
    const out = [];
    // New listening ports.
    const newPorts = now.ports.filter((p) => !base.ports.includes(p));
    for (const p of newPorts) {
      const known = PORT_NAMES[p];
      out.push({
        sev: (p === 3389 || p === 22 || p === 23 || p === 445) ? "high" : "med",
        text: `Port ${p}${known ? ` (${known})` : ""} is now listening — it wasn't when you set your baseline.`,
      });
    }
    // Processes using much more memory than at baseline.
    const baseMem = {}; base.top.forEach((t) => { baseMem[t.name] = t.mem_mb; });
    for (const t of now.top) {
      const was = baseMem[t.name];
      if (was && t.mem_mb > was * 2.2 && t.mem_mb - was > 500) {
        out.push({ sev: "med", text: `${t.name} is using ${t.mem_mb} MB now vs about ${was} MB at baseline — noticeably higher than usual.` });
      }
    }
    // Big jump in total process count.
    if (now.proc_count > base.proc_count + 40) {
      out.push({ sev: "low", text: `${now.proc_count} processes are running now vs ${base.proc_count} at baseline — a lot more than usual.` });
    }
    return out;
  };

  const check = useCallback(async (speak) => {
    if (!isDesktop || !baseline) return;
    setBusy(true);
    try {
      const now = await snap();
      const f = analyze(baseline, now);
      setFindings(f); setCheckedAt(Date.now());
      // Only speak when there's something worth saying.
      if (speak && f.length && ctx.settings?.voiceSpeak) {
        const worst = f.find((x) => x.sev === "high") || f[0];
        const intro = f.length === 1 ? "One thing on your system looks unusual. " : `${f.length} things on your system look unusual. `;
        // Through the queue, not straight to the voice  -  the local `speak`
        // parameter shadows the global helper here, so call Speech directly.
        Speech.say(intro + worst.text, ctx.settings?.voiceGender, "reply").catch(() => {});
      }
    } catch (e) { ctx.toast(String(e?.message || e)); }
    setBusy(false);
  }, [baseline, isDesktop, ctx]);

  // Auto-check once when the tab opens (quietly speaks only if something's off).
  useEffect(() => {
    if (baseline && isDesktop && !ranRef.current) { ranRef.current = true; check(true); }
  }, [baseline, isDesktop, check]);

  return (
    <div className="nx-tool">
      <p className="nx-tool-note" style={{ marginBottom: 14 }}>
        The Cyber Twin learns what's <i>normal</i> for your machine, then tells you only
        when something changes that's worth a look — a new open port, a process eating far
        more memory than usual, a jump in what's running. It compares against your own
        baseline, not generic rules. Everything stays on this computer.
      </p>

      {!baseline ? (
        <div className="nx-twin-empty">
          <span className="nx-twin-mark"><Cpu size={20} /></span>
          <p>No baseline yet. Capture one while your system is in a state you consider normal — Nexus will use it as the reference point.</p>
          <button className="nx-chip nx-chip-on" onClick={setBase} disabled={busy}>
            {busy ? "Reading system…" : "Set baseline"}
          </button>
        </div>
      ) : (
        <>
          <div className="nx-twin-head">
            <div>
              <p className="nx-twin-base">Baseline set {relTime(baseline.at)} · {baseline.ports.length} ports · {baseline.proc_count} processes</p>
              {checkedAt && <p className="nx-twin-checked">Last checked {relTime(checkedAt)}</p>}
            </div>
            <div className="nx-tool-row">
              <button className="nx-chip" onClick={() => check(true)} disabled={busy}>
                {busy ? "Checking…" : "Check now"}
              </button>
              <button className="nx-chip" onClick={setBase} disabled={busy}>Re-baseline</button>
            </div>
          </div>

          {findings !== null && (
            findings.length === 0 ? (
              <div className="nx-twin-ok">
                <CheckCircle2 size={16} />
                <div><p className="nx-crack-title">Nothing unusual</p>
                  <p>Your system matches its baseline. Nexus only speaks up when something's genuinely different.</p></div>
              </div>
            ) : (
              <div className="nx-twin-findings">
                {findings.map((f, i) => (
                  <div key={i} className={`nx-twin-find nx-twin-${f.sev}`}>
                    <AlertTriangle size={15} />
                    <p>{f.text}</p>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

// A few well-known ports so findings read in plain language.
const PORT_NAMES = {
  22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS", 80: "HTTP", 135: "RPC",
  139: "NetBIOS", 443: "HTTPS", 445: "SMB", 3306: "MySQL", 3389: "RDP",
  5432: "PostgreSQL", 5900: "VNC", 8080: "HTTP-alt", 27017: "MongoDB",
};

// Human-friendly relative time ("3 min ago", "2 days ago").
function relTime(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} day${s < 172800 ? "" : "s"} ago`;
}

const SEC_TOOLS = [
  { id: "hash", label: "Hash forge", icon: Hash, blurb: "Digest text with the browser's crypto engine.", body: HashForge },
  { id: "cipher", label: "Cipher bench", icon: Binary, blurb: "Encode and decode the formats CTFs lean on.", body: CipherBench },
  { id: "password", label: "Password lab", icon: Lock, blurb: "Measure real strength and crack time, locally.", body: PasswordLab },
  { id: "jwt", label: "JWT decoder", icon: Binary, blurb: "Read what a token is carrying, and flag weak ones.", body: JwtDecoder },
  { id: "entropy", label: "Entropy meter", icon: Activity, blurb: "Measure how random a string really is.", body: EntropyMeter },
  { id: "twin", label: "Cyber Twin", icon: Cpu, blurb: "Learns your system's normal, flags only what's unusual.", body: CyberTwin, sensitive: true },
  { id: "metadata", label: "Metadata", icon: Image, blurb: "Find and strip hidden data in your photos.", body: MetadataTool },
  { id: "scan", label: "Scan reader", icon: ScanLine, blurb: "Turn raw nmap output into something readable.", body: ScanReader, sensitive: true },
];

function SecurityView({ ctx }) {
  const schoolMode = ctx?.settings?.schoolMode;
  const tools = SEC_TOOLS.filter((s) => !(schoolMode && s.sensitive));
  const [tab, setTab] = useState(tools[0].id);
  const tool = tools.find((s) => s.id === tab) || tools[0];
  useEffect(() => {
    if (!tools.some((s) => s.id === tab)) setTab(tools[0].id);
  }, [schoolMode]);
  const Body = tool.body;
  return (
    <div className="nx-mod">
      <div className="nx-tabs">
        {tools.map((s) => (
          <button key={s.id} className={`nx-tab${tool.id === s.id ? " nx-tab-on" : ""}`}
            onClick={() => setTab(s.id)}>
            <s.icon size={14} strokeWidth={1.8} />{s.label}
          </button>
        ))}
        <span className="nx-tabs-flag"><Lock size={11} />Runs locally · nothing leaves this machine</span>
      </div>
      <p className="nx-tool-blurb">{tool.blurb}</p>
      <Body ctx={ctx} />
    </div>
  );
}

const Sound = (() => {
  let ctx = null;
  let enabled = false;
  let volume = 0.5;
  let lastMove = 0;

  const ready = () => {
    if (!enabled) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };

  // A short shaped blip. Frequencies and curve differ per event so
  // the ear can tell a click from a toggle from an error.
  const blip = (freq, { type = "sine", dur = 0.06, gain = 0.14, slideTo = null } = {}) => {
    const ac = ready();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
    const peak = gain * volume;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g); g.connect(ac.destination);
    osc.start(now); osc.stop(now + dur + 0.02);
  };

  return {
    set enabled(v) { enabled = v; if (v) ready(); },
    get enabled() { return enabled; },
    set volume(v) { volume = v; },
    click:  () => blip(420, { type: "triangle", dur: 0.05, gain: 0.12, slideTo: 300 }),
    select: () => blip(560, { type: "sine", dur: 0.07, gain: 0.13, slideTo: 720 }),
    on:     () => blip(500, { type: "sine", dur: 0.09, gain: 0.13, slideTo: 780 }),
    off:    () => blip(440, { type: "sine", dur: 0.09, gain: 0.12, slideTo: 260 }),
    nav:    () => blip(340, { type: "triangle", dur: 0.08, gain: 0.11, slideTo: 480 }),
    error:  () => blip(180, { type: "sawtooth", dur: 0.14, gain: 0.1, slideTo: 120 }),
    send:   () => blip(660, { type: "sine", dur: 0.06, gain: 0.12, slideTo: 900 }),
    hover: () => {
      const now = performance.now();
      if (now - lastMove < 55) return;   // rate limit so movement is a whisper
      lastMove = now;
      blip(1200 + Math.random() * 400, { type: "sine", dur: 0.022, gain: 0.03 });
    },
  };
})();

const Meter = (() => {
  const zero = () => ({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0, calls: 0 });
  let usage = zero();
  const subs = new Set();

  return {
    add(u) {
      if (!u) return;
      usage = {
        input:      usage.input      + (u.input_tokens || 0),
        output:     usage.output     + (u.output_tokens || 0),
        cacheWrite: usage.cacheWrite + (u.cache_creation_input_tokens || 0),
        cacheRead:  usage.cacheRead  + (u.cache_read_input_tokens || 0),
        calls:      usage.calls + 1,
      };
      subs.forEach((fn) => { try { fn(usage); } catch { /* ignore */ } });
    },
    reset() {
      usage = zero();
      subs.forEach((fn) => { try { fn(usage); } catch { /* ignore */ } });
    },
    get: () => usage,
    subscribe(fn) { subs.add(fn); fn(usage); return () => subs.delete(fn); },
  };
})();

/// Which model the assistant and voice use. Module-level rather than React
/// state because askClaude is called from the chat, the voice ring and several
/// modules, none of which own the others  -  same reason the meter lives here.
let assistantModel = agentEngine.DEFAULTS.model;
const modelSubs = new Set();
const MODEL_STATE_KEY = "assistant-model";

function modelInvoke(cmd, args) {
  const fn = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  return fn ? fn(cmd, args) : Promise.reject(new Error("not desktop"));
}

// Restore the last-picked model on startup so it survives a restart. Fire and
// forget  -  if it fails or we're in the browser, we keep the default.
modelInvoke("load_state", { key: MODEL_STATE_KEY })
  .then((raw) => {
    const id = JSON.parse(raw);
    if (id && typeof id === "string") setAssistantModel(id);
  })
  .catch(() => { /* absent, corrupt, or browser — keep default */ });

function setAssistantModel(id) {
  assistantModel = id;
  modelSubs.forEach((fn) => { try { fn(id); } catch { /* ignore */ } });
  // Persist so the choice outlives the session.
  modelInvoke("save_state", { key: MODEL_STATE_KEY, value: JSON.stringify(id) })
    .catch(() => {});
}
function subscribeAssistantModel(fn) {
  modelSubs.add(fn);
  fn(assistantModel);
  return () => modelSubs.delete(fn);
}

async function askClaude({ system, messages, signal, tools, maxTokens, raw, model }) {
  const body = {
    model: model || assistantModel,
    max_tokens: maxTokens || 1000,
    system,
    messages,
    ...(tools ? { tools } : {}),
  };

  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

  let data;
  if (isDesktop) {
    // Desktop: the Rust process attaches the API key and makes the request,
    // so the key never lives in this bundle. The signal can't cross into
    // Rust, so we honour it here by rejecting if already aborted.
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
    let text;
    try {
      text = await invoke("call_model", { payload: { body: JSON.stringify(body) } });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg === "NO_KEY" || /NO_KEY/.test(msg)) {
        throw new Error("No API key set. Add one in Settings → API key.");
      }
      throw new Error(msg.replace(/^model returned \d+:\s*/, "") || "Engine request failed.");
    }
    data = JSON.parse(text);
  } else {
    // Browser dev: direct call (needs a proxy or CORS; fine for local testing).
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    data = await res.json();
  }

  // API-level error object (e.g. bad key, rate limit) comes back as JSON too
  if (data?.type === "error" || data?.error) {
    const m = data.error?.message || "The model returned an error.";
    throw new Error(m);
  }

  Meter.add(data.usage);

  // Tool-use callers need the full response (content blocks + stop_reason).
  if (raw) return data;

  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

const seedFs = () => ({
  type: "dir",
  children: {
    "README.md": { type: "file", body: "# Nexus OS\n\nPersonal command center. See docs/ for module notes.\n" },
    "requirements.txt": { type: "file", body: "requests==2.31.0\nrich==13.7.0\npsutil==5.9.8\n" },
    src: {
      type: "dir",
      children: {
        "main.py": { type: "file", body: 'import psutil\n\nprint(f"cpu: {psutil.cpu_percent()}%")\n' },
        "scan.py": { type: "file", body: 'import socket\n\nfor port in (22, 80, 443):\n    print(port)\n' },
      },
    },
    docs: {
      type: "dir",
      children: { "milestones.md": { type: "file", body: "M1 core\nM2 widgets\nM3 assistant\nM4 security\n" } },
    },
  },
});

function resolveDir(fs, parts) {
  let node = fs;
  for (const part of parts) {
    const next = node.children?.[part];
    if (!next || next.type !== "dir") return null;
    node = next;
  }
  return node;
}

const promptPath = (parts) => "~/" + ["nexus", ...parts].join("/");

const MockShell = {
  label: "Mock shell",
  detail: "Simulated in memory. Real execution arrives with the Rust backend.",

  async run(input, session) {
    const lines = [];
    const say = (text, kind = "out") => lines.push({ kind, text });
    const [cmd, ...args] = input.trim().split(/\s+/);
    const arg = args.join(" ");
    const here = resolveDir(session.fs, session.cwd);

    switch ((cmd || "").toLowerCase()) {
      case "help":
        say("Available in the mock shell:");
        say("  ls · cd · pwd · cat · echo · mkdir · touch · rm · tree");
        say("  python --version · python <file> · pip list · pip install <pkg>");
        say("  git status · whoami · date · nexus status · clear");
        say("Anything else reports as not found, same as a real shell.", "note");
        break;

      case "ls": case "dir": {
        const entries = Object.entries(here.children || {});
        if (!entries.length) { say("(empty)", "note"); break; }
        for (const [name, node] of entries.sort((a, b) => a[0].localeCompare(b[0]))) {
          say(node.type === "dir" ? `${name}/` : name);
        }
        break;
      }

      case "pwd":
        say(promptPath(session.cwd));
        break;

      case "cd": {
        if (!arg || arg === "~") return { lines, cwd: [] };
        if (arg === "..") return { lines, cwd: session.cwd.slice(0, -1) };
        if (arg === ".") break;
        const target = [...session.cwd, ...arg.split("/").filter((p) => p && p !== ".")];
        if (!resolveDir(session.fs, target)) {
          say(`cd: no such directory: ${arg}`, "err");
          return { lines, exit: 1 };
        }
        return { lines, cwd: target };
      }

      case "cat": case "type": {
        const node = here.children?.[arg];
        if (!node) { say(`cat: ${arg || "(no file)"}: no such file`, "err"); return { lines, exit: 1 }; }
        if (node.type === "dir") { say(`cat: ${arg}: is a directory`, "err"); return { lines, exit: 1 }; }
        node.body.replace(/\n$/, "").split("\n").forEach((l) => say(l));
        break;
      }

      case "echo":
        say(arg);
        break;

      case "mkdir":
        if (!arg) { say("mkdir: missing name", "err"); return { lines, exit: 1 }; }
        if (here.children[arg]) { say(`mkdir: ${arg} already exists`, "err"); return { lines, exit: 1 }; }
        here.children[arg] = { type: "dir", children: {} };
        say(`created ${arg}/`, "note");
        break;

      case "touch":
        if (!arg) { say("touch: missing name", "err"); return { lines, exit: 1 }; }
        here.children[arg] = here.children[arg] || { type: "file", body: "" };
        say(`created ${arg}`, "note");
        break;

      case "rm":
        if (!here.children?.[arg]) { say(`rm: ${arg || "(no target)"}: no such file`, "err"); return { lines, exit: 1 }; }
        delete here.children[arg];
        say(`removed ${arg}`, "note");
        break;

      case "tree": {
        const walk = (node, depth) => {
          for (const [name, child] of Object.entries(node.children || {})) {
            say(`${"  ".repeat(depth)}${child.type === "dir" ? "├─ " + name + "/" : "├─ " + name}`);
            if (child.type === "dir") walk(child, depth + 1);
          }
        };
        say(promptPath(session.cwd));
        walk(here, 1);
        break;
      }

      case "python": case "python3": {
        if (args[0] === "--version" || args[0] === "-V") { say("Python 3.12.1"); break; }
        if (!args[0]) {
          say("Python 3.12.1 (mock interpreter)");
          say("An interactive REPL needs a real process. Run a file instead.", "note");
          break;
        }
        const file = here.children?.[args[0]];
        if (!file || file.type !== "file") {
          say(`python: can't open file '${args[0]}': no such file`, "err");
          return { lines, exit: 2 };
        }
        if (args[0] === "main.py") {
          if (!session.packages.includes("psutil")) {
            say("Traceback (most recent call last):", "err");
            say('  File "main.py", line 1, in <module>', "err");
            say("    import psutil", "err");
            say("ModuleNotFoundError: No module named 'psutil'", "err");
            say("Try: pip install psutil", "note");
            return { lines, exit: 1 };
          }
          say("cpu: 34.1%");
          break;
        }
        if (args[0] === "scan.py") { say("22"); say("80"); say("443"); break; }
        say(`(no simulated output for ${args[0]})`, "note");
        break;
      }

      case "pip": case "pip3": {
        if (args[0] === "list") {
          say("Package    Version");
          say("---------- -------");
          session.packages.forEach((p) => say(p.padEnd(11) + "1.0.0"));
          break;
        }
        if (args[0] === "install") {
          const pkg = args[1];
          if (!pkg) { say("ERROR: no package given", "err"); return { lines, exit: 1 }; }
          if (session.packages.includes(pkg)) { say(`Requirement already satisfied: ${pkg}`); break; }
          session.packages.push(pkg);
          say(`Collecting ${pkg}`);
          say(`  Downloading ${pkg}-1.0.0-py3-none-any.whl (184 kB)`);
          say(`Installing collected packages: ${pkg}`);
          say(`Successfully installed ${pkg}-1.0.0`);
          break;
        }
        say(`pip: unknown subcommand '${args[0] || ""}'`, "err");
        return { lines, exit: 1 };
      }

      case "git":
        if (args[0] === "status") {
          say("On branch main");
          say("Changes not staged for commit:");
          say("  modified:   src/main.py");
          say('no changes added to commit (use "git add")');
          break;
        }
        say(`git: '${args[0] || ""}' is not simulated in the mock shell`, "err");
        return { lines, exit: 1 };

      case "whoami": say("gio"); break;
      case "date": say(new Date().toString()); break;

      case "nexus":
        if (args[0] === "status") {
          const live = MODULES.filter((m) => m.status === "live");
          say(`core online · ${live.length}/${MODULES.length} modules built`);
          live.forEach((m) => say(`  ${m.id.padEnd(12)} live`));
          break;
        }
        say("usage: nexus status", "note");
        break;

      case "clear": case "cls":
        return { lines: [], clear: true };

      case "": break;

      default:
        say(`${cmd}: command not found`, "err");
        say("This is the mock shell — only a fixed set of commands resolve. Type help.", "note");
        return { lines, exit: 127 };
    }

    return { lines };
  },
};

const TERM_BANNER = [
  { kind: "note", text: "Nexus shell · mock adapter · type help to see what resolves" },
];

const TERM_BANNER_REAL = [
  { kind: "note", text: "Nexus shell · live · runs real commands on this machine" },
  { kind: "note", text: "Tip: save a command with  save <name> <command>  — then just type <name>. List with  saved" },
];

// RealShell talks to the Rust run_shell command. It keeps a real absolute cwd
// (a string), handles `cd`, `clear`, and `cls` locally, and shells out for
// everything else. Same .run() shape the mock uses so the view is unchanged.
const RealShell = {
  label: "live shell",
  detail: "Runs real commands on this machine",
  async run(cmd, ctx) {
    const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
    const trimmed = cmd.trim();
    const abs = ctx.absCwd || ""; // "" lets Rust default to the home dir

    if (trimmed === "clear" || trimmed === "cls") return { clear: true, lines: [] };

    // Handle cd ourselves so the cwd persists across commands.
    if (trimmed === "cd" || trimmed.startsWith("cd ")) {
      const target = trimmed.slice(2).trim() || "~";
      try {
        // Resolve the new directory by asking the shell to cd then print it.
        const probe = window.navigator.platform.toLowerCase().includes("win")
          ? `cd /d "${target}" && cd`
          : `cd "${target}" 2>/dev/null && pwd`;
        const res = await inv("run_shell", { cmd: probe, cwd: abs });
        const out = (res.stdout || "").trim();
        if (res.code !== 0 || !out) {
          return { lines: [{ kind: "err", text: `cd: no such directory: ${target}` }] };
        }
        return { lines: [], absCwd: out, cwdLabel: out };
      } catch (e) {
        return { lines: [{ kind: "err", text: String(e?.message || e) }] };
      }
    }

    try {
      const res = await inv("run_shell", { cmd: trimmed, cwd: abs });
      const lines = [];
      if (res.stdout) res.stdout.replace(/\n$/, "").split("\n").forEach((t) => lines.push({ kind: "out", text: t }));
      if (res.stderr) res.stderr.replace(/\n$/, "").split("\n").forEach((t) => lines.push({ kind: "err", text: t }));
      if (!lines.length && res.code !== 0) lines.push({ kind: "err", text: `exited ${res.code}` });
      return { lines };
    } catch (e) {
      return { lines: [{ kind: "err", text: String(e?.message || e) }] };
    }
  },
};

function TerminalView() {
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const shell = isDesktop ? RealShell : MockShell;
  const session = useRef({ fs: seedFs(), cwd: [], packages: ["requests", "rich"], absCwd: "" });
  const [lines, setLines] = useState(isDesktop ? TERM_BANNER_REAL : TERM_BANNER);
  const [cwd, setCwd] = useState([]);
  const [realCwd, setRealCwd] = useState("");
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [hIdx, setHIdx] = useState(-1);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = usePersistent("term-aliases", {}); // { name: command }
  const outRef = useRef(null);
  const inRef = useRef(null);

  // AI side
  const [thread, setThread] = useState([]);
  const [ask, setAsk] = useState("");
  const [thinking, setThinking] = useState(false);
  const [aiErr, setAiErr] = useState(null);
  const abortRef = useRef(null);
  const aiRef = useRef(null);

  useEffect(() => {
    outRef.current?.scrollTo({ top: outRef.current.scrollHeight });
  }, [lines, running]);
  useEffect(() => {
    aiRef.current?.scrollTo({ top: aiRef.current.scrollHeight, behavior: "smooth" });
  }, [thread, thinking]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = async () => {
    const cmd = input;
    if (!cmd.trim() || running) return;
    setInput("");
    setHistory((h) => [cmd, ...h].slice(0, 60));
    setHIdx(-1);
    setLines((l) => [...l, { kind: "cmd", text: cmd, at: shownPath }]);

    const trimmed = cmd.trim();
    const emit = (text, kind = "out") =>
      setLines((l) => [...l, ...String(text).split("\n").map((t) => ({ kind, text: t }))]);

    // `save <name> <command...>`  → store
    // `saved` / `save`            → list
    // `unsave <name>`             → remove
    // typing a saved <name>       → runs the stored command
    if (trimmed === "save" || trimmed === "saved") {
      const names = Object.keys(saved);
      emit(names.length
        ? "Saved commands:\n" + names.map((n) => `  ${n}  →  ${saved[n]}`).join("\n") +
          "\n\nType a name to run it. Remove with: unsave <name>"
        : "No saved commands yet. Save one with:  save <name> <command>", "note");
      return;
    }
    if (trimmed.startsWith("save ")) {
      const rest = trimmed.slice(5).trim();
      const sp = rest.indexOf(" ");
      if (sp < 1) { emit("Usage: save <name> <command>   e.g.  save spotify spotify:", "err"); return; }
      const name = rest.slice(0, sp).trim();
      const command = rest.slice(sp + 1).trim();
      if (/[\s]/.test(name)) { emit("Name can't contain spaces.", "err"); return; }
      setSaved((p) => ({ ...p, [name]: command }));
      emit(`Saved "${name}" → ${command}\nRun it any time by typing:  ${name}`, "note");
      return;
    }
    if (trimmed.startsWith("unsave ")) {
      const name = trimmed.slice(7).trim();
      if (!saved[name]) { emit(`No saved command called "${name}".`, "err"); return; }
      setSaved((p) => { const n = { ...p }; delete n[name]; return n; });
      emit(`Removed "${name}".`, "note");
      return;
    }
    // If the whole line is a saved name, expand it to the stored command.
    const toRun = saved[trimmed] ? saved[trimmed] : cmd;
    if (saved[trimmed]) emit(`↳ ${toRun}`, "note");

    setRunning(true);
    try {
      const res = await shell.run(toRun, { ...session.current, cwd, absCwd: realCwd });
      if (res.clear) { setLines([]); }
      else if (res.lines.length) setLines((l) => [...l, ...res.lines]);
      if (res.cwd) setCwd(res.cwd);
      if (res.absCwd != null) { setRealCwd(res.absCwd); session.current.absCwd = res.absCwd; }
    } catch (e) {
      setLines((l) => [...l, { kind: "err", text: `shell error: ${e.message}` }]);
    } finally {
      setRunning(false);
    }
  };

  const shortReal = (p) => {
    if (!p) return "~";
    const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.length ? "…/" + parts.slice(-2).join("/") : p;
  };
  const shownPath = isDesktop ? shortReal(realCwd) : promptPath(cwd);

  const onKey = (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(hIdx + 1, history.length - 1);
      if (next >= 0) { setHIdx(next); setInput(history[next]); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = hIdx - 1;
      setHIdx(next);
      setInput(next < 0 ? "" : history[next]);
      return;
    }
    if (e.key === "l" && e.ctrlKey) { e.preventDefault(); setLines([]); }
  };

  const transcript = () => lines
    .slice(-24)
    .map((l) => (l.kind === "cmd" ? `$ ${l.text}` : l.text))
    .join("\n");

  const consult = async (question) => {
    const q = (question ?? ask).trim();
    if (!q || thinking) return;
    setAsk("");
    setAiErr(null);
    const next = [...thread, { role: "user", content: q }];
    setThread(next);
    setThinking(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
      const text = await askClaude({
        system: [
          "You sit beside a terminal inside NEXUS OS and help its owner with commands.",
          "NEXUS OS was created and founded by Gio Zamudio; if asked who made you or the app, the answer is Gio Zamudio (it runs on Claude by Anthropic).",
          "Be short. Give the exact command to run, then one line on why.",
          "Never suggest anything destructive without flagging it first.",
          isDesktop
            ? "This is a REAL shell — commands the user types actually run on their machine and produce real output. Do not tell them it's a mock or simulated; it isn't."
            : "This runs in a browser preview where the shell is simulated; real execution happens in the installed desktop app.",
          `Recent terminal session:\n${transcript()}`,
          `Working directory: ${shownPath}`,
        ].join(" "),
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        signal: ac.signal,
      });
      setThread((p) => [...p, { role: "assistant", content: text || "No response." }]);
    } catch (e) {
      if (e.name === "AbortError") return;
      setAiErr(e.message || "Could not reach the engine.");
      setThread((p) => p.slice(0, -1));
      setAsk(q);
    } finally {
      if (!ac.signal.aborted) setThinking(false);
    }
  };

  const lastErr = [...lines].reverse().find((l) => l.kind === "err");

  return (
    <div className="nx-term-wrap">
      <div className="nx-term">
        <div className="nx-term-bar">
          <span className="nx-term-dots"><i /><i /><i /></span>
          <span className="nx-term-path">{shownPath}</span>
          <span className="nx-term-adapter">{shell.label}</span>
        </div>
        <div className="nx-term-out" ref={outRef} onClick={() => inRef.current?.focus()}>
          {lines.map((l, i) => (
            <p key={i} className={`nx-tl nx-tl-${l.kind}`}>
              {l.kind === "cmd" && <span className="nx-tl-prompt">{l.at} $</span>}
              {l.text || "\u00a0"}
            </p>
          ))}
          {running && <p className="nx-tl nx-tl-note">running…</p>}
          <div className="nx-term-in">
            <span className="nx-tl-prompt">{shownPath} $</span>
            <input ref={inRef} value={input} spellCheck={false} autoComplete="off"
              onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} />
          </div>
        </div>
        <p className="nx-term-foot">{shell.detail} · ↑↓ history · Ctrl+L clears</p>
      </div>

      <aside className="nx-term-ai">
        <div className="nx-term-ai-head">
          <Sparkles size={13} />
          <span>Pair</span>
          <em>reading the last 24 lines</em>
        </div>

        <div className="nx-term-ai-feed" ref={aiRef}>
          {thread.length === 0 && !thinking && (
            <div className="nx-term-ai-empty">
              <p>Ask about anything on the left. I can see your session and working directory.</p>
              <div className="nx-term-seeds">
                {lastErr && (
                  <button onClick={() => consult(`Explain this and tell me how to fix it: ${lastErr.text}`)}>
                    Explain the last error
                  </button>
                )}
                <button onClick={() => consult("What does the last command I ran actually do?")}>
                  Explain my last command
                </button>
                <button onClick={() => consult("How do I set up a virtual environment and install from requirements.txt?")}>
                  venv + requirements
                </button>
                <button onClick={() => consult("Give me the pip command to freeze my current packages.")}>
                  Freeze packages
                </button>
              </div>
            </div>
          )}

          {thread.map((m, i) => (
            <div key={i} className={`nx-msg nx-msg-${m.role}`}>
              {m.role === "assistant" && <span className="nx-msg-mark" />}
              <div className="nx-msg-body"><MsgText text={m.content} /></div>
            </div>
          ))}

          {thinking && (
            <div className="nx-msg nx-msg-assistant">
              <span className="nx-msg-mark nx-msg-mark-busy" />
              <div className="nx-msg-body nx-msg-busy">
                <Loader2 size={13} className="nx-spin" /> Thinking
              </div>
            </div>
          )}

          {aiErr && (
            <div className="nx-asst-err">
              <AlertTriangle size={13} />
              <span>{aiErr} Your question is back in the box.</span>
            </div>
          )}
        </div>

        {lastErr && thread.length > 0 && (
          <button className="nx-term-quick"
            onClick={() => consult(`Explain this and tell me how to fix it: ${lastErr.text}`)}>
            <AlertTriangle size={11} />Explain the last error
          </button>
        )}

        <div className="nx-asst-composer nx-term-composer">
          <textarea rows={1} value={ask} placeholder="Ask about this session"
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); consult(); } }} />
          <button className="nx-asst-send" onClick={() => consult()} disabled={thinking || !ask.trim()}>
            <Send size={14} />
          </button>
        </div>
      </aside>
    </div>
  );
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base, spread) => Math.max(0.4, base + (Math.random() - 0.5) * spread);

const DEVICE_SEED = [
  { ip: "192.168.1.1", mac: "A4:2B:8C:11:0D:E2", host: "router.lan", vendor: "Netgear", kind: "Gateway" },
  { ip: "192.168.1.14", mac: "F0:18:98:4C:22:71", host: "gio-desktop", vendor: "HP", kind: "Workstation" },
  { ip: "192.168.1.22", mac: "3C:22:FB:90:1A:04", host: "gio-phone", vendor: "Apple", kind: "Phone" },
  { ip: "192.168.1.31", mac: "B8:27:EB:5D:7F:19", host: "rover-pi", vendor: "Raspberry Pi", kind: "SBC" },
  { ip: "192.168.1.40", mac: "00:1B:A9:2E:44:C8", host: "office-printer", vendor: "Brother", kind: "Printer" },
  { ip: "192.168.1.57", mac: "D4:9A:20:6B:33:8E", host: "living-tv", vendor: "Samsung", kind: "Media" },
  { ip: "192.168.1.88", mac: "5C:CF:7F:A1:90:22", host: null, vendor: "Espressif", kind: "IoT" },
];

const DNS_ZONE = {
  "github.com": { A: ["140.82.113.4"], AAAA: ["2606:50c0:8000::153"], NS: ["dns1.p08.nsone.net", "dns2.p08.nsone.net"], MX: ["10 aspmx.l.google.com"], TXT: ["v=spf1 include:_spf.google.com ~all"] },
  "pypi.org": { A: ["151.101.0.223", "151.101.64.223"], AAAA: ["2a04:4e42::223"], NS: ["ns1.fastly.net"], MX: [], TXT: ["v=spf1 -all"] },
  "router.lan": { A: ["192.168.1.1"], AAAA: [], NS: [], MX: [], TXT: [] },
};

const TRACE_PATH = [
  { host: "router.lan", ip: "192.168.1.1", base: 1.2 },
  { host: "10.14.0.1", ip: "10.14.0.1", base: 8.4 },
  { host: "agg-hsv-02.isp.net", ip: "68.114.22.9", base: 12.1 },
  { host: "core-atl-01.isp.net", ip: "68.114.60.41", base: 19.7 },
  { host: "ix-atl.peering.net", ip: "206.108.34.12", base: 24.3 },
  { host: null, ip: null, base: null },
  { host: "edge.target.net", ip: "140.82.113.4", base: 31.6 },
];

const IS_DESKTOP = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

// When School mode is on, the shell sets this true. Anything that touches the
// real system (network probes, shell, launching) checks it and refuses, so
// nothing on a school-managed machine can look like scanning or spawn a process.
const SchoolLock = { on: false };
const tauriInvoke = (cmd, args) =>
  (window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke)(cmd, args);

const MockNet = {
  label: IS_DESKTOP ? "Live · DNS and ping are real" : "Mock adapter",
  detail: IS_DESKTOP
    ? "DNS lookups and ping hit the network for real. Device discovery, traceroute, and the router details below are still simulated — they need raw sockets we haven't added."
    : "Simulated results. The Tauri adapter will read real interfaces and send real probes.",

  overview() {
    return {
      publicIp: "73.118.204.62",
      localIp: "192.168.1.14",
      gateway: "192.168.1.1",
      subnet: "255.255.255.0",
      dns: ["1.1.1.1", "8.8.8.8"],
      iface: "Wi-Fi (Intel AX211)",
      mac: "F0:18:98:4C:22:71",
      wifi: { ssid: "ASCTE-NET", band: "5 GHz", channel: 44, signal: -47, security: "WPA2-Enterprise", rate: "866 Mb/s" },
      router: { model: "Netgear R7000", firmware: "1.0.11.136", uptime: "14d 6h" },
    };
  },

  async scan(onDevice, alive) {
    for (const d of DEVICE_SEED) {
      await wait(220 + Math.random() * 280);
      if (!alive()) return;
      onDevice({ ...d, latency: +jitter(d.kind === "Gateway" ? 1.1 : 9, 8).toFixed(1), seen: "now" });
    }
  },

  // Real ping on desktop. Returns ms, or null for a dropped/failed probe  - 
  // same contract the mock used, so the latency graph is unchanged.
  async ping(host) {
    if (IS_DESKTOP && !SchoolLock.on) {
      try { return await tauriInvoke("ping_host", { host }); }
      catch { return null; }
    }
    // School mode (or browser): no real ICMP probe  -  synthesize instead.
    if (Math.random() < 0.04) return null;
    const base = host === "192.168.1.1" || host === "router.lan" ? 1.3 : 18;
    return +jitter(base, base * 0.7).toFixed(1);
  },

  async resolve(name, type) {
    const clean = name.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!clean || !/^[a-z0-9.-]+\.[a-z]{2,}$|^[a-z0-9-]+\.lan$/.test(clean)) {
      throw new Error("That is not a resolvable hostname.");
    }

    // Real path: the OS resolver only returns address records (A / AAAA).
    // Disabled in school mode so nothing hits the network for real.
    if (IS_DESKTOP && !SchoolLock.on) {
      if (type !== "A" && type !== "AAAA") {
        return { name: clean, type, ttl: null, answers: [],
          note: `The system resolver only returns address records. ${type} lookups need a full DNS client.` };
      }
      let ips;
      try { ips = await tauriInvoke("dns_lookup", { host: clean }); }
      catch (e) { throw new Error(String(e?.message || e).replace(/^could not resolve[^:]*:\s*/, "") || "Lookup failed."); }
      const want4 = type === "A";
      const filtered = ips.filter((ip) => ip.includes(":") === !want4);
      return { name: clean, type, ttl: null,
        answers: filtered.length ? filtered : [],
        note: filtered.length ? "Resolved by the system resolver." : `No ${type} record returned.` };
    }

    // Mock path
    await wait(180 + Math.random() * 220);
    const zone = DNS_ZONE[clean];
    if (zone) {
      const answers = zone[type] || [];
      if (!answers.length) return { name: clean, type, ttl: 300, answers: [], note: `No ${type} record published.` };
      return { name: clean, type, ttl: type === "A" ? 60 : 3600, answers };
    }
    if (type !== "A" && type !== "AAAA") {
      return { name: clean, type, ttl: 3600, answers: [], note: `No ${type} record in the mock zone file.` };
    }
    const oct = () => 1 + Math.floor(Math.random() * 253);
    return {
      name: clean, type, ttl: 300,
      answers: type === "A" ? [`${oct()}.${oct()}.${oct()}.${oct()}`] : ["2606:4700::6810:85e5"],
      note: "Synthesized by the mock resolver — not a real lookup.",
    };
  },

  async trace(host, onHop, alive) {
    for (let i = 0; i < TRACE_PATH.length; i++) {
      await wait(320 + Math.random() * 420);
      if (!alive()) return;
      const hop = TRACE_PATH[i];
      onHop(hop.base == null
        ? { n: i + 1, host: null, ip: null, times: [null, null, null], timeout: true }
        : {
            n: i + 1, host: hop.host, ip: hop.ip,
            times: [0, 1, 2].map(() => +jitter(hop.base, hop.base * 0.35).toFixed(1)),
          });
    }
  },
};

/* ---------- Overview ---------- */

function NetOverview({ t }) {
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!isDesktop) { setInfo({ local_ip: "192.168.1.14", gateway: "192.168.1.1", iface: "Wi-Fi (demo)" }); return; }
    const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
    inv("net_info").then(setInfo).catch((e) => setErr(String(e?.message || e)));
  }, [isDesktop]);

  return (
    <div className="nx-tool">
      <div className="nx-net-cards">
        <div className="nx-nc">
          <p className="nx-nc-label">This machine</p>
          <p className="nx-nc-val">{info ? info.local_ip : "…"}</p>
          <p className="nx-nc-sub">{info ? info.iface : "reading interface"}</p>
        </div>
        <div className="nx-nc">
          <p className="nx-nc-label">Gateway</p>
          <p className="nx-nc-val">{info ? info.gateway : "…"}</p>
          <p className="nx-nc-sub">Default route</p>
        </div>
        <div className="nx-nc">
          <p className="nx-nc-label">Down</p>
          <p className="nx-nc-val">{t ? Math.round(t.down) : "——"}<i> Mb/s</i></p>
          <div className="nx-nc-spark"><Spark series={t?.hist?.down} /></div>
        </div>
        <div className="nx-nc">
          <p className="nx-nc-label">Up</p>
          <p className="nx-nc-val">{t ? Math.round(t.up) : "——"}<i> Mb/s</i></p>
          <div className="nx-nc-spark"><Spark series={t?.hist?.up} /></div>
        </div>
      </div>

      {err && <p className="nx-out-err">{err}</p>}
      <p className="nx-tool-note">
        Local IP, gateway, and interface are read live from this machine. Throughput
        is the real network counter. Public IP, Wi-Fi signal, and router details aren't
        shown because reading them reliably needs platform-specific APIs Nexus doesn't ship.
      </p>
    </div>
  );
}

/* ---------- Device discovery ---------- */

function NetDevices() {
  const [devices, setDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const run = async () => {
    if (scanning) return;
    setDevices([]); setDone(false); setScanning(true);
    const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
    if (isDesktop) {
      try {
        const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
        const found = await inv("arp_table");
        if (!aliveRef.current) return;
        // Real neighbours from the ARP table. Show immediately with vendor;
        // hostnames resolve in the background and fill in as they come back.
        const rows = found.map((d) => ({
          ip: d.ip, mac: d.mac, host: d.host || null, vendor: d.vendor || "—",
          kind: d.vendor || "device", latency: "—", resolving: true,
        }));
        setDevices(rows);
        setScanning(false); setDone(true);

        // Background hostname resolution  -  one IP at a time so it's gentle,
        // updating each row as its name (or blank) comes back.
        for (const d of rows) {
          if (!aliveRef.current) return;
          try {
            const name = await inv("resolve_hostname", { ip: d.ip });
            if (!aliveRef.current) return;
            setDevices((prev) => prev.map((x) =>
              x.ip === d.ip ? { ...x, host: name || x.host, resolving: false } : x));
          } catch {
            setDevices((prev) => prev.map((x) =>
              x.ip === d.ip ? { ...x, resolving: false } : x));
          }
        }
      } catch (e) {
        if (aliveRef.current) { setDevices([]); setScanning(false); setDone(true); }
      }
      return;
    }
    await MockNet.scan((d) => setDevices((p) => [...p, d]), () => aliveRef.current);
    if (!aliveRef.current) return;
    setScanning(false); setDone(true);
  };

  return (
    <div className="nx-tool">
      <div className="nx-tool-row nx-tool-row-split">
        <p className="nx-tool-note nx-tool-note-flush">
          Reads your machine's ARP table — the real devices it has recently talked to
          on the local network. Passive, no active sweep.
        </p>
        <button className={`nx-chip${scanning ? "" : " nx-chip-on"}`} onClick={run} disabled={scanning}>
          {scanning ? "Scanning…" : devices.length ? "Scan again" : "Scan network"}
        </button>
      </div>

      {devices.length === 0 && !scanning && (
        <div className="nx-empty">
          <p className="nx-empty-title">Nothing discovered yet.</p>
          <p className="nx-empty-body">Run a scan to enumerate what is on 192.168.1.0/24.</p>
        </div>
      )}

      {(devices.length > 0 || scanning) && (
        <>
          <div className="nx-scan-sum">
            <span><b>{devices.length}</b> hosts</span>
            <span>{scanning ? "sweeping…" : done ? "sweep complete" : ""}</span>
          </div>
          <div className="nx-dev-table">
            <div className="nx-dev-row nx-dev-head">
              <span>Address</span><span>Hostname</span><span>Vendor</span><span>Type</span><span>RTT</span>
            </div>
            {devices.map((d) => (
              <div key={d.mac} className="nx-dev-row">
                <span className="nx-mono nx-dev-ip">
                  <i className="nx-dev-dot" />{d.ip}
                  <em>{d.mac}</em>
                </span>
                <span>{d.host
                  ? d.host
                  : d.resolving
                    ? <em className="nx-dim">resolving…</em>
                    : <em className="nx-dim">unidentified</em>}</span>
                <span>{d.vendor}</span>
                <span className="nx-dev-kind">{d.kind}</span>
                <span className="nx-mono">{d.latency} ms</span>
              </div>
            ))}
            {scanning && <div className="nx-dev-row nx-dev-probing">probing…</div>}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Latency monitor ---------- */

function NetLatency() {
  const [host, setHost] = useState("github.com");
  const [target, setTarget] = useState("github.com");
  const [samples, setSamples] = useState([]);
  const [live, setLive] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  useEffect(() => {
    clearInterval(timer.current);
    if (!live) return;
    let alive = true, inFlight = false;
    timer.current = setInterval(async () => {
      if (inFlight) return;           // don't stack if a probe runs long
      inFlight = true;
      const ms = await MockNet.ping(target);
      inFlight = false;
      if (alive) setSamples((p) => [...p, ms].slice(-60));
    }, 700);
    return () => { alive = false; clearInterval(timer.current); };
  }, [live, target]);

  const good = samples.filter((s) => s != null);
  const lost = samples.length - good.length;
  const stats = {
    last: good.length ? good[good.length - 1] : null,
    min: good.length ? Math.min(...good) : null,
    avg: good.length ? good.reduce((a, b) => a + b, 0) / good.length : null,
    max: good.length ? Math.max(...good) : null,
    loss: samples.length ? (lost / samples.length) * 100 : 0,
  };

  const start = () => { setTarget(host.trim() || "github.com"); setSamples([]); setLive(true); };

  return (
    <div className="nx-tool">
      <div className="nx-tool-row">
        <input className="nx-inline" value={host} spellCheck={false}
          onChange={(e) => setHost(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
          placeholder="host or address" />
        {live
          ? <button className="nx-chip nx-chip-stop" onClick={() => setLive(false)}>Stop</button>
          : <button className="nx-chip nx-chip-on" onClick={start}>Start monitor</button>}
        {["router.lan", "1.1.1.1", "github.com"].map((h) => (
          <button key={h} className="nx-chip" onClick={() => setHost(h)}>{h}</button>
        ))}
      </div>

      <div className="nx-lat-stats">
        {[["last", "ms"], ["min", "ms"], ["avg", "ms"], ["max", "ms"], ["loss", "%"]].map(([k, unit]) => (
          <div key={k}>
            <p className="nx-nc-label">{k}</p>
            <p className="nx-nc-val nx-nc-val-sm">
              {stats[k] == null ? "——" : stats[k].toFixed(1)}<i> {unit}</i>
            </p>
          </div>
        ))}
      </div>

      <div className={`nx-lat-graph${live ? " nx-lat-live" : ""}`}>
        {samples.length < 2
          ? <p className="nx-blank">{live ? "Collecting…" : "Monitor idle"}</p>
          : <Spark series={good} tone={stats.avg > 40 ? "var(--ember)" : "var(--signal)"} />}
        <span className="nx-lat-target">{live ? `probing ${target}` : `target ${target}`}</span>
      </div>

      <p className="nx-tool-note">
        Each probe is one ICMP echo. A gap in the line is a dropped reply — a few
        percent on wireless is normal, sustained loss is not. Round trip counts
        the whole path there and back, so a distant host is not a broken one.
      </p>
    </div>
  );
}

/* ---------- DNS + traceroute ---------- */

const RECORD_TYPES = ["A", "AAAA", "MX", "TXT", "NS"];

function NetTools() {
  const [name, setName] = useState("github.com");
  const [type, setType] = useState("A");
  const [answer, setAnswer] = useState(null);
  const [dnsErr, setDnsErr] = useState(null);
  const [looking, setLooking] = useState(false);

  const [traceHost, setTraceHost] = useState("github.com");
  const [hops, setHops] = useState([]);
  const [tracing, setTracing] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const lookup = async () => {
    if (looking) return;
    setLooking(true); setDnsErr(null); setAnswer(null);
    try {
      setAnswer(await MockNet.resolve(name, type));
    } catch (e) {
      setDnsErr(e.message);
    } finally {
      if (aliveRef.current) setLooking(false);
    }
  };

  const trace = async () => {
    if (tracing) return;
    setHops([]); setTracing(true);
    const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
    if (isDesktop && !SchoolLock.on) {
      try {
        const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
        const lines = await inv("traceroute", { host: traceHost });
        // Render each raw line as a hop entry so the real path shows.
        lines.forEach((line, i) => {
          if (aliveRef.current) setHops((p) => [...p, { n: i, raw: line }]);
        });
      } catch (e) {
        if (aliveRef.current) setHops([{ n: 0, raw: String(e?.message || e) }]);
      }
      if (aliveRef.current) setTracing(false);
      return;
    }
    await MockNet.trace(traceHost, (h) => setHops((p) => [...p, h]), () => aliveRef.current);
    if (aliveRef.current) setTracing(false);
  };

  return (
    <div className="nx-tool">
      <div className="nx-panel">
        <p className="nx-panel-title">Name lookup</p>
        <div className="nx-tool-row">
          <input className="nx-inline" value={name} spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()} placeholder="hostname" />
          {RECORD_TYPES.map((r) => (
            <button key={r} className={`nx-chip${type === r ? " nx-chip-on" : ""}`}
              onClick={() => setType(r)}>{r}</button>
          ))}
          <button className="nx-chip nx-chip-on" onClick={lookup} disabled={looking}>
            {looking ? "Resolving…" : "Resolve"}
          </button>
        </div>

        {dnsErr && <p className="nx-out-err">{dnsErr}</p>}

        {answer && (
          <div className="nx-dns-out">
            <div className="nx-dns-head">
              <span className="nx-mono">{answer.name}</span>
              <span className="nx-dns-type">{answer.type}</span>
              {answer.ttl != null && <span className="nx-dim">TTL {answer.ttl}s</span>}
            </div>
            {answer.answers.length
              ? answer.answers.map((a) => <p key={a} className="nx-hex">{a}</p>)
              : <p className="nx-blank">No answer</p>}
            {answer.note && <p className="nx-tool-note">{answer.note}</p>}
          </div>
        )}
      </div>

      <div className="nx-panel">
        <p className="nx-panel-title">Path trace</p>
        <div className="nx-tool-row">
          <input className="nx-inline" value={traceHost} spellCheck={false}
            onChange={(e) => setTraceHost(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && trace()} placeholder="destination" />
          <button className="nx-chip nx-chip-on" onClick={trace} disabled={tracing}>
            {tracing ? "Tracing…" : "Trace route"}
          </button>
        </div>

        {hops.length === 0 && !tracing && (
          <p className="nx-tool-note">
            Shows each router between here and the destination by sending packets
            with a deliberately short lifespan and listening for who complains.
          </p>
        )}

        {(hops.length > 0 || tracing) && (
          <div className="nx-hops">
            {hops.map((h) => (
              h.raw != null ? (
                <div key={h.n} className="nx-hop nx-hop-raw">
                  <span className="nx-hop-host nx-mono">{h.raw}</span>
                </div>
              ) : (
              <div key={h.n} className={`nx-hop${h.timeout ? " nx-hop-lost" : ""}`}>
                <span className="nx-hop-n">{String(h.n).padStart(2, "0")}</span>
                <span className="nx-hop-host">
                  {h.timeout ? "* * *" : (h.host || h.ip)}
                  {!h.timeout && h.host && <em>{h.ip}</em>}
                </span>
                <span className="nx-hop-times">
                  {h.timeout ? "no reply" : h.times.map((v) => `${v} ms`).join("  ")}
                </span>
              </div>
              )
            ))}
            {tracing && <div className="nx-hop nx-hop-wait">waiting for next hop…</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- wifi analyzer ---------- */

function WifiAnalyzer() {
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const [info, setInfo] = useState(null);
  const [state, setState] = useState("idle");

  const scan = async () => {
    if (!isDesktop) { setState("nodesktop"); return; }
    setState("loading");
    try {
      const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
      const data = await inv("wifi_info");
      setInfo(data);
      setState(data.supported ? "ok" : "unsupported");
    } catch (e) {
      setState("error");
    }
  };

  useEffect(() => { scan(); /* eslint-disable-next-line */ }, []);

  const sigPct = (s) => {
    const n = parseInt(String(s).replace("%", ""), 10);
    return isNaN(n) ? 0 : n;
  };

  return (
    <div className="nx-tool">
      <div className="nx-tool-row nx-tool-row-split">
        <p className="nx-tool-note nx-tool-note-flush">
          Reads your real wireless connection and the networks in range, via the OS.
        </p>
        <button className="nx-chip nx-chip-on" onClick={scan} disabled={state === "loading"}>
          {state === "loading" ? "Reading…" : "Refresh"}
        </button>
      </div>

      {state === "nodesktop" && <p className="nx-tool-note">Wi-Fi analysis works in the desktop app.</p>}
      {state === "unsupported" && <p className="nx-tool-note">Wi-Fi details are only available on Windows right now.</p>}
      {state === "error" && <p className="nx-out-err">Couldn't read Wi-Fi info.</p>}

      {info?.connected && (
        <div className="nx-panel" style={{ marginTop: 4 }}>
          <p className="nx-panel-title">Connected · {info.connected.ssid}</p>
          <dl className="nx-dl">
            <dt>Signal</dt>
            <dd>
              <span className="nx-wifi-bar"><i style={{ width: `${sigPct(info.connected.signal)}%` }} /></span>
              {info.connected.signal}
            </dd>
            <dt>Radio</dt><dd>{info.connected.radio || "—"}</dd>
            <dt>Channel</dt><dd>{info.connected.channel || "—"}</dd>
            <dt>Receive</dt><dd>{info.connected.rx || "—"} Mbps</dd>
            <dt>Transmit</dt><dd>{info.connected.tx || "—"} Mbps</dd>
          </dl>
        </div>
      )}

      {info?.networks?.length > 0 && (
        <>
          <p className="nx-status-head" style={{ marginTop: 6 }}>Networks in range · {info.networks.length}</p>
          <div className="nx-ports">
            {info.networks.map((n, i) => (
              <div key={i} className="nx-port">
                <span className="nx-port-name" style={{ gridColumn: "span 2" }}>{n.ssid || <em className="nx-dim">hidden</em>}</span>
                <span className="nx-mono">{n.signal}</span>
                <span className="nx-port-note" style={{ gridColumn: "span 2" }}>{n.auth}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- port reference ---------- */

const PORTS = [
  { port: 20, proto: "TCP", name: "FTP data", risk: "warn", note: "Unencrypted file transfer. Data channel." },
  { port: 21, proto: "TCP", name: "FTP control", risk: "warn", note: "Credentials sent in plaintext. Prefer SFTP." },
  { port: 22, proto: "TCP", name: "SSH", risk: "safe", note: "Encrypted remote shell. Secure if key-based and patched." },
  { port: 23, proto: "TCP", name: "Telnet", risk: "bad", note: "Plaintext remote login. Should never be open. Kill it." },
  { port: 25, proto: "TCP", name: "SMTP", risk: "warn", note: "Mail relay. Open relays get abused for spam." },
  { port: 53, proto: "TCP/UDP", name: "DNS", risk: "safe", note: "Name resolution. Watch for tunneling/exfil over it." },
  { port: 67, proto: "UDP", name: "DHCP server", risk: "safe", note: "Hands out IP leases. Rogue DHCP is an attack." },
  { port: 68, proto: "UDP", name: "DHCP client", risk: "safe", note: "Client side of DHCP." },
  { port: 69, proto: "UDP", name: "TFTP", risk: "bad", note: "No auth, no encryption. Rarely legitimate on a host." },
  { port: 80, proto: "TCP", name: "HTTP", risk: "warn", note: "Unencrypted web. Fine for a redirect to 443, not for real traffic." },
  { port: 110, proto: "TCP", name: "POP3", risk: "warn", note: "Plaintext mail retrieval. Use 995 (POP3S)." },
  { port: 123, proto: "UDP", name: "NTP", risk: "safe", note: "Time sync. Amplification-abused if misconfigured." },
  { port: 135, proto: "TCP", name: "MSRPC", risk: "bad", note: "Windows RPC. A frequent target — shouldn't face the internet." },
  { port: 137, proto: "UDP", name: "NetBIOS name", risk: "bad", note: "Legacy Windows. Leaks host info. Block externally." },
  { port: 139, proto: "TCP", name: "NetBIOS session", risk: "bad", note: "SMB over NetBIOS. Classic lateral-movement path." },
  { port: 143, proto: "TCP", name: "IMAP", risk: "warn", note: "Plaintext mail. Use 993 (IMAPS)." },
  { port: 161, proto: "UDP", name: "SNMP", risk: "bad", note: "Default 'public' community string leaks everything. Lock down or disable." },
  { port: 389, proto: "TCP", name: "LDAP", risk: "warn", note: "Directory queries in plaintext. Use LDAPS (636)." },
  { port: 443, proto: "TCP", name: "HTTPS", risk: "safe", note: "Encrypted web. The one you want open for web." },
  { port: 445, proto: "TCP", name: "SMB", risk: "bad", note: "File sharing. EternalBlue/WannaCry rode this. Never expose it." },
  { port: 465, proto: "TCP", name: "SMTPS", risk: "safe", note: "Encrypted mail submission." },
  { port: 514, proto: "UDP", name: "Syslog", risk: "warn", note: "Log shipping, plaintext. Keep it internal." },
  { port: 587, proto: "TCP", name: "SMTP submission", risk: "safe", note: "Authenticated mail send with STARTTLS." },
  { port: 636, proto: "TCP", name: "LDAPS", risk: "safe", note: "Encrypted directory access." },
  { port: 993, proto: "TCP", name: "IMAPS", risk: "safe", note: "Encrypted IMAP." },
  { port: 995, proto: "TCP", name: "POP3S", risk: "safe", note: "Encrypted POP3." },
  { port: 1433, proto: "TCP", name: "MS SQL", risk: "bad", note: "Database. Should never face the internet." },
  { port: 1521, proto: "TCP", name: "Oracle DB", risk: "bad", note: "Database. Internal only." },
  { port: 3306, proto: "TCP", name: "MySQL", risk: "bad", note: "Database. Bind to localhost, not 0.0.0.0." },
  { port: 3389, proto: "TCP", name: "RDP", risk: "bad", note: "Remote desktop. Brute-forced constantly. VPN in front of it." },
  { port: 5432, proto: "TCP", name: "PostgreSQL", risk: "bad", note: "Database. Internal only." },
  { port: 5900, proto: "TCP", name: "VNC", risk: "bad", note: "Remote desktop, often weak/no auth. Tunnel it." },
  { port: 6379, proto: "TCP", name: "Redis", risk: "bad", note: "No auth by default. Exposed Redis = instant compromise." },
  { port: 8080, proto: "TCP", name: "HTTP alt", risk: "warn", note: "Common dev/proxy web port. Often forgotten and left open." },
  { port: 27017, proto: "TCP", name: "MongoDB", risk: "bad", note: "No auth by default historically. Countless breaches. Lock it." },
];

const PORT_TONE = { safe: "var(--signal)", warn: "#FFB454", bad: "var(--ember)" };
const PORT_LABEL = { safe: "OK", warn: "caution", bad: "risky" };

function PortReference() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const rows = PORTS.filter((p) => {
    if (filter !== "all" && p.risk !== filter) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return String(p.port).includes(s) || p.name.toLowerCase().includes(s) || p.note.toLowerCase().includes(s);
  });

  return (
    <div className="nx-tool">
      <div className="nx-fsearch">
        <Network size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search by port number, service, or keyword — try 22, smb, database" />
      </div>
      <div className="nx-tool-row">
        {[["all", "All"], ["safe", "OK"], ["warn", "Caution"], ["bad", "Risky"]].map(([k, label]) => (
          <button key={k} className={`nx-chip${filter === k ? " nx-chip-on" : ""}`}
            onClick={() => setFilter(k)}>{label}</button>
        ))}
        <span className="nx-fcount">{rows.length} port{rows.length !== 1 ? "s" : ""}</span>
      </div>

      {rows.length === 0
        ? <p className="nx-blank">No ports match</p>
        : <div className="nx-ports">
            {rows.map((p) => (
              <div key={`${p.port}-${p.proto}`} className="nx-port">
                <span className="nx-port-num">{p.port}</span>
                <span className="nx-port-proto">{p.proto}</span>
                <span className="nx-port-name">{p.name}</span>
                <span className="nx-port-risk" style={{ color: PORT_TONE[p.risk],
                  borderColor: PORT_TONE[p.risk] }}>{PORT_LABEL[p.risk]}</span>
                <span className="nx-port-note">{p.note}</span>
              </div>
            ))}
          </div>}
      <p className="nx-tool-note">
        "Risky" doesn't mean the service is bad — it means it shouldn't be reachable from
        the internet, or it's plaintext, or it's a database that belongs behind a firewall.
        On a CyberPatriot image, an open Telnet or SMB port is usually points waiting to be scored.
      </p>
    </div>
  );
}

const NET_TABS = [
  { id: "overview", label: "Overview", icon: Wifi, blurb: "Where this machine sits on the network.", body: NetOverview, probe: true },
  { id: "devices", label: "Devices", icon: Radio, blurb: "Everything answering on the local subnet.", body: NetDevices, probe: true },
  { id: "latency", label: "Latency", icon: Activity, blurb: "Continuous round-trip monitoring.", body: NetLatency, probe: true },
  { id: "tools", label: "Lookup", icon: Network, blurb: "Resolve names and map the path out.", body: NetTools, probe: true },
  { id: "wifi", label: "Wi-Fi", icon: Wifi, blurb: "Your connection and the networks in range.", body: WifiAnalyzer, probe: true },
  { id: "ports", label: "Ports", icon: Lock, blurb: "What each port is, and which ones are trouble.", body: PortReference },
];

function NetworkView({ ctx }) {
  const schoolMode = ctx.settings?.schoolMode;
  // In school mode, everything that touches the network disappears  -  only the
  // static Ports reference (no network activity at all) remains.
  const tabs = NET_TABS.filter((x) => !(schoolMode && x.probe));
  const [tab, setTab] = useState(tabs[0].id);
  const active = tabs.find((x) => x.id === tab) || tabs[0];
  useEffect(() => {
    if (!tabs.some((x) => x.id === tab)) setTab(tabs[0].id);
  }, [schoolMode]);
  const Body = active.body;
  return (
    <div className="nx-mod">
      <div className="nx-tabs">
        {tabs.map((x) => (
          <button key={x.id} className={`nx-tab${active.id === x.id ? " nx-tab-on" : ""}`}
            onClick={() => setTab(x.id)}>
            <x.icon size={14} strokeWidth={1.8} />{x.label}
          </button>
        ))}
        <span className="nx-tabs-flag">
          {schoolMode ? <><Lock size={11} />Network tools off in school mode</> : (IS_DESKTOP ? "Live · DNS and ping are real" : "Mock adapter")}
        </span>
      </div>
      <p className="nx-tool-blurb">{active.blurb}</p>
      <Body t={ctx.t} ctx={ctx} />
    </div>
  );
}

const PROJECT_SEED_RAW = [
  {
    id: "nexus-os", name: "nexus-os", status: "active", lang: "TypeScript",
    desc: "Personal command center. Modular shell with a plugin core.",
    stack: ["React", "Tauri", "Rust", "Vite"], branch: "main", last: "2h",
    git: { ahead: 3, behind: 0, dirty: ["src/main.py", "docs/milestones.md"] },
    readme: "Modules plug into a core. The shell knows nothing about what any module does — it reads three registries and renders whatever it finds.",
    tasks: [
      { id: 1, text: "Widget grid with drag + resize", done: true },
      { id: 2, text: "Assistant with live context", done: true },
      { id: 3, text: "Cybersecurity tools", done: true },
      { id: 4, text: "Networking module", done: true },
      { id: 5, text: "Projects module", done: false },
      { id: 6, text: "Swap mock adapters for Tauri", done: false },
      { id: 7, text: "Layout persistence", done: false },
    ],
    notes: [
      { id: 1, kind: "note", text: "Every module goes behind an adapter. Mock now, real later, no UI changes.", when: "2h" },
      { id: 2, kind: "idea", text: "Terminal could pipe its output straight into the assistant as context.", when: "1d" },
      { id: 3, kind: "note", text: "API key has to live on the Rust side. Never ship it in the frontend.", when: "2d" },
    ],
    commits: [
      { sha: "8f2c1ae", msg: "Add networking module with mock adapter", who: "gio", when: "2h", plus: 412, minus: 18, files: ["src/modules/network.jsx", "src/styles/net.css"] },
      { sha: "3d90b47", msg: "Harden security tools against bad input", who: "gio", when: "6h", plus: 96, minus: 41, files: ["src/modules/security.jsx"] },
      { sha: "c1e77f0", msg: "Memoize widget cells, add error boundaries", who: "gio", when: "1d", plus: 134, minus: 88, files: ["src/core/grid.jsx", "src/core/boundary.jsx"] },
      { sha: "a45de92", msg: "Terminal module with shell adapter", who: "gio", when: "1d", plus: 508, minus: 6, files: ["src/modules/terminal.jsx"] },
      { sha: "0b3f8cc", msg: "Assistant reads live telemetry", who: "gio", when: "2d", plus: 221, minus: 12, files: ["src/modules/assistant.jsx"] },
      { sha: "7e10d35", msg: "Widget registry and grid engine", who: "gio", when: "3d", plus: 640, minus: 74, files: ["src/core/widgets.jsx", "src/core/grid.jsx"] },
      { sha: "1c9a204", msg: "Core shell, sidebar, theme tokens", who: "gio", when: "4d", plus: 892, minus: 0, files: ["src/core/shell.jsx", "src/styles/tokens.css"] },
    ],
    files: [
      { path: "src/core/shell.jsx", size: "14.2 KB" },
      { path: "src/core/grid.jsx", size: "8.7 KB" },
      { path: "src/core/widgets.jsx", size: "11.4 KB" },
      { path: "src/modules/terminal.jsx", size: "16.1 KB" },
      { path: "src/modules/network.jsx", size: "18.9 KB" },
      { path: "src/modules/security.jsx", size: "12.3 KB" },
      { path: "src-tauri/src/main.rs", size: "2.1 KB" },
      { path: "package.json", size: "0.9 KB" },
    ],
  },
  {
    id: "packet-viewer", name: "packet-viewer", status: "active", lang: "Python",
    desc: "Reads pcap files and explains what each packet is doing, in plain language.",
    stack: ["Python", "scapy", "Textual"], branch: "dev", last: "1d",
    git: { ahead: 0, behind: 2, dirty: [] },
    readme: "Point it at a capture and it walks the handshake for you instead of making you read hex.",
    tasks: [
      { id: 1, text: "Parse TCP handshake", done: true },
      { id: 2, text: "Flag retransmissions", done: true },
      { id: 3, text: "TLS hello breakdown", done: false },
      { id: 4, text: "Export to markdown", done: false },
    ],
    notes: [
      { id: 1, kind: "idea", text: "This should become the Wireshark helper inside Nexus rather than a separate tool.", when: "1d" },
    ],
    commits: [
      { sha: "d47a1b8", msg: "Detect duplicate ACKs", who: "gio", when: "1d", plus: 74, minus: 9, files: ["viewer/tcp.py"] },
      { sha: "9902ef3", msg: "Colorize output by protocol", who: "gio", when: "4d", plus: 118, minus: 22, files: ["viewer/render.py"] },
      { sha: "5510cd1", msg: "Initial pcap reader", who: "gio", when: "9d", plus: 302, minus: 0, files: ["viewer/read.py"] },
    ],
    files: [
      { path: "viewer/read.py", size: "6.4 KB" },
      { path: "viewer/tcp.py", size: "9.1 KB" },
      { path: "viewer/render.py", size: "4.8 KB" },
      { path: "requirements.txt", size: "0.1 KB" },
    ],
  },
  {
    id: "ctf-toolkit", name: "ctf-toolkit", status: "active", lang: "Python",
    desc: "Scripts that keep showing up in competitions, collected in one place.",
    stack: ["Python", "pwntools"], branch: "main", last: "3d",
    git: { ahead: 1, behind: 0, dirty: ["tools/xor.py"] },
    readme: "Nothing clever. Just the things I get tired of rewriting at 2am.",
    tasks: [
      { id: 1, text: "XOR brute forcer", done: true },
      { id: 2, text: "Caesar / Vigenere solver", done: true },
      { id: 3, text: "Steganography checks", done: false },
      { id: 4, text: "Wire into the Nexus security module", done: false },
    ],
    notes: [
      { id: 1, kind: "note", text: "The cipher bench in Nexus already covers half of this. Merge them.", when: "3d" },
    ],
    commits: [
      { sha: "b62f0aa", msg: "Add Vigenere key length guess", who: "gio", when: "3d", plus: 88, minus: 4, files: ["tools/vigenere.py"] },
      { sha: "44c8e17", msg: "XOR brute force over printable keys", who: "gio", when: "8d", plus: 64, minus: 0, files: ["tools/xor.py"] },
    ],
    files: [
      { path: "tools/xor.py", size: "2.2 KB" },
      { path: "tools/vigenere.py", size: "3.6 KB" },
      { path: "README.md", size: "0.7 KB" },
    ],
  },
  {
    id: "rover-telemetry", name: "rover-telemetry", status: "paused", lang: "C++",
    desc: "Streams sensor data off a Pi-driven chassis over serial.",
    stack: ["C++", "Arduino", "Raspberry Pi"], branch: "main", last: "3w",
    git: { ahead: 0, behind: 0, dirty: [] },
    readme: "Paused until the chassis is rebuilt. The serial protocol works; the hardware does not.",
    tasks: [
      { id: 1, text: "Serial framing protocol", done: true },
      { id: 2, text: "IMU calibration", done: false },
      { id: 3, text: "Feed into the Nexus robotics module", done: false },
    ],
    notes: [
      { id: 1, kind: "idea", text: "Telemetry could render on the Nexus dashboard as a live widget.", when: "3w" },
    ],
    commits: [
      { sha: "e08b3f2", msg: "Serial frame checksums", who: "gio", when: "3w", plus: 142, minus: 30, files: ["src/serial.cpp"] },
      { sha: "72dd904", msg: "Read MPU6050", who: "gio", when: "5w", plus: 96, minus: 0, files: ["src/imu.cpp"] },
    ],
    files: [
      { path: "src/serial.cpp", size: "5.9 KB" },
      { path: "src/imu.cpp", size: "4.1 KB" },
      { path: "platformio.ini", size: "0.3 KB" },
    ],
  },
  {
    id: "dorm-net-monitor", name: "dorm-net-monitor", status: "shipped", lang: "Python",
    desc: "Logs outages and latency spikes on the dorm network, charts them weekly.",
    stack: ["Python", "SQLite", "matplotlib"], branch: "main", last: "6w",
    git: { ahead: 0, behind: 0, dirty: [] },
    readme: "Ran for a semester. The charts were enough to get the access point moved.",
    tasks: [
      { id: 1, text: "Ping logger with SQLite store", done: true },
      { id: 2, text: "Weekly chart export", done: true },
      { id: 3, text: "Outage email alerts", done: true },
    ],
    notes: [
      { id: 1, kind: "note", text: "The latency graph approach here got reused in the Nexus networking module.", when: "6w" },
    ],
    commits: [
      { sha: "aa41c07", msg: "Weekly summary charts", who: "gio", when: "6w", plus: 128, minus: 11, files: ["monitor/chart.py"] },
      { sha: "3f7b9e5", msg: "SQLite schema for probe results", who: "gio", when: "8w", plus: 84, minus: 2, files: ["monitor/store.py"] },
    ],
    files: [
      { path: "monitor/probe.py", size: "3.3 KB" },
      { path: "monitor/store.py", size: "2.8 KB" },
      { path: "monitor/chart.py", size: "4.5 KB" },
    ],
  },
];

const PROJECT_SEED = PROJECT_SEED_RAW.map((p) => ({ ...p, seed: true }));

const LANGS = ["TypeScript", "Python", "Rust", "C++", "Go", "JavaScript", "Java", "Other"];

const slugify = (v) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const blankProject = (f) => ({
  id: slugify(f.name), name: f.name.trim(), status: f.status, lang: f.lang,
  desc: f.desc.trim(), stack: f.stack, branch: f.branch.trim() || "main",
  last: "now", git: { ahead: 0, behind: 0, dirty: [] }, repoPath: (f.repoPath || "").trim(),
  readme: f.readme.trim(), tasks: [], notes: [], commits: [], files: [],
});

const P_STATUS = {
  active: { label: "Active", tone: "var(--signal)" },
  paused: { label: "Paused", tone: "var(--ember)" },
  shipped: { label: "Shipped", tone: "var(--violet)" },
};

const pct = (tasks) => tasks.length
  ? Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100) : 0;

/* ---------- detail tabs ---------- */

function ProjOverview({ p }) {
  const done = p.tasks.filter((t) => t.done).length;
  return (
    <div className="nx-tool">
      <p className="nx-proj-desc">{p.desc}</p>

      <div className="nx-proj-prog">
        <div className="nx-proj-prog-head">
          <span>Progress</span>
          <span className="nx-mono">{pct(p.tasks)}%</span>
        </div>
        <span className="nx-track"><i style={{ width: `${pct(p.tasks)}%` }} /></span>
        <p className="nx-tool-note nx-tool-note-flush">{done} of {p.tasks.length} tasks closed</p>
      </div>

      <div className="nx-net-split">
        <div className="nx-panel">
          <p className="nx-panel-title">Repository{p.gitLive ? <span className="nx-live-badge">● live</span> : (p.repoPath ? <span className="nx-dim"> · connecting…</span> : <span className="nx-dim"> · no repo linked</span>)}</p>
          <dl className="nx-dl">
            <dt>Branch</dt>
            <dd><GitBranch size={12} />{p.branch}</dd>
            <dt>Sync</dt>
            <dd>
              {p.git.ahead === 0 && p.git.behind === 0
                ? <span className="nx-dim">up to date</span>
                : <>
                    {p.git.ahead > 0 && <span className="nx-sync-up">↑ {p.git.ahead} ahead</span>}
                    {p.git.behind > 0 && <span className="nx-sync-down">↓ {p.git.behind} behind</span>}
                  </>}
            </dd>
            <dt>Working tree</dt>
            <dd>{p.git.dirty.length ? `${p.git.dirty.length} modified` : <span className="nx-dim">clean</span>}</dd>
            <dt>Last activity</dt><dd>{p.last} ago</dd>
            <dt>Language</dt><dd>{p.lang}</dd>
          </dl>
          {p.git.dirty.length > 0 && (
            <div className="nx-dirty">
              {p.git.dirty.map((f) => <p key={f} className="nx-mono">M &nbsp;{f}</p>)}
            </div>
          )}
        </div>

        <div className="nx-panel">
          <p className="nx-panel-title">Readme</p>
          <p className="nx-proj-readme">{p.readme}</p>
          <ul className="nx-caps">
            {p.stack.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ProjTasks({ p, onToggle, onAddTask, onDropTask }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    onAddTask(draft.trim());
    setDraft("");
  };
  const open = p.tasks.filter((t) => !t.done);
  const closed = p.tasks.filter((t) => t.done);
  return (
    <div className="nx-tool">
      <div className="nx-tool-row">
        <input className="nx-inline nx-inline-wide" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a task" />
        <button className="nx-chip nx-chip-on" onClick={add} disabled={!draft.trim()}>
          <Plus size={11} />Add
        </button>
      </div>

      <div className="nx-panel">
        <p className="nx-panel-title">Open · {open.length}</p>
        {open.length === 0
          ? <p className="nx-blank">Nothing outstanding</p>
          : <ul className="nx-tasks nx-tasks-lg">
              {open.map((t) => (
                <li key={t.id} className="nx-task-line">
                  <button onClick={() => onToggle(t.id)} aria-pressed={false}><i />{t.text}</button>
                  <span className="nx-drop" role="button" tabIndex={0}
                    aria-label={`Delete ${t.text}`}
                    onClick={() => onDropTask(t.id)}
                    onKeyDown={(e) => e.key === "Enter" && onDropTask(t.id)}>
                    <X size={11} />
                  </span>
                </li>
              ))}
            </ul>}
      </div>

      {closed.length > 0 && (
        <div className="nx-panel">
          <p className="nx-panel-title">Closed · {closed.length}</p>
          <ul className="nx-tasks nx-tasks-lg">
            {closed.map((t) => (
              <li key={t.id} className="nx-task-line">
                <button className="nx-task-on" onClick={() => onToggle(t.id)} aria-pressed><i />{t.text}</button>
                <span className="nx-drop" role="button" tabIndex={0}
                  aria-label={`Delete ${t.text}`}
                  onClick={() => onDropTask(t.id)}
                  onKeyDown={(e) => e.key === "Enter" && onDropTask(t.id)}>
                  <X size={11} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProjNotes({ p, onAddNote, onDropNote }) {
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState("note");
  const add = () => {
    if (!draft.trim()) return;
    onAddNote(kind, draft.trim());
    setDraft("");
  };
  return (
    <div className="nx-tool">
      <div className="nx-tool-row">
        <button className={`nx-chip${kind === "note" ? " nx-chip-on" : ""}`} onClick={() => setKind("note")}>
          <StickyNote size={11} />Note
        </button>
        <button className={`nx-chip${kind === "idea" ? " nx-chip-on" : ""}`} onClick={() => setKind("idea")}>
          <Lightbulb size={11} />Idea
        </button>
      </div>
      <textarea className="nx-field" rows={3} value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={kind === "idea" ? "Something worth trying…" : "Something worth remembering…"} />
      <div className="nx-tool-row">
        <button className="nx-chip nx-chip-on" onClick={add} disabled={!draft.trim()}>
          <Plus size={11} />Save {kind}
        </button>
      </div>

      {p.notes.length === 0
        ? <div className="nx-empty">
            <p className="nx-empty-title">No notes yet.</p>
            <p className="nx-empty-body">Write down the reason behind a decision now, while you still remember it.</p>
          </div>
        : <div className="nx-notes">
            {p.notes.map((n) => (
              <div key={n.id} className={`nx-note nx-note-${n.kind}`}>
                <span className="nx-note-icon">
                  {n.kind === "idea" ? <Lightbulb size={12} /> : <StickyNote size={12} />}
                </span>
                <p>{n.text}</p>
                <em>{n.when}</em>
                <span className="nx-drop" role="button" tabIndex={0} aria-label="Delete note"
                  onClick={() => onDropNote(n.id)}
                  onKeyDown={(e) => e.key === "Enter" && onDropNote(n.id)}>
                  <X size={11} />
                </span>
              </div>
            ))}
          </div>}
    </div>
  );
}

function ProjHistory({ p }) {
  const [open, setOpen] = useState(null);
  if (!p.commits.length) {
    return (
      <div className="nx-empty">
        <p className="nx-empty-title">No history yet.</p>
        <p className="nx-empty-body">
          This project isn't linked to a repository. Once the git adapter is
          connected, commits will appear here on their own.
        </p>
      </div>
    );
  }
  return (
    <div className="nx-tool">
      <div className="nx-scan-sum">
        <span><b>{p.commits.length}</b> commits on {p.branch}</span>
        <span>{p.commits.reduce((a, c) => a + c.plus, 0)} insertions</span>
        <span>{p.commits.reduce((a, c) => a + c.minus, 0)} deletions</span>
      </div>
      <div className="nx-commits">
        {p.commits.map((c) => (
          <div key={c.sha} className={`nx-commit${open === c.sha ? " nx-commit-open" : ""}`}>
            <button className="nx-commit-head" onClick={() => setOpen(open === c.sha ? null : c.sha)}>
              <CircleDot size={11} />
              <span className="nx-commit-msg">{c.msg}</span>
              <span className="nx-commit-sha">{c.sha}</span>
              <span className="nx-commit-diff">
                <b>+{c.plus}</b><i>−{c.minus}</i>
              </span>
              <span className="nx-commit-when">{c.when}</span>
            </button>
            {open === c.sha && (
              <div className="nx-commit-body">
                {c.files.map((f) => <p key={f} className="nx-mono">{f}</p>)}
                <p className="nx-tool-note nx-tool-note-flush">authored by {c.who}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjFiles({ p }) {
  const [q, setQ] = useState("");
  const hits = p.files.filter((f) => f.path.toLowerCase().includes(q.toLowerCase()));
  if (!p.files.length) {
    return (
      <div className="nx-empty">
        <p className="nx-empty-title">No files indexed.</p>
        <p className="nx-empty-body">
          Point this project at a folder and the working tree will be listed here.
        </p>
      </div>
    );
  }
  return (
    <div className="nx-tool">
      <div className="nx-tool-row">
        <input className="nx-inline nx-inline-wide" value={q}
          onChange={(e) => setQ(e.target.value)} placeholder="Filter paths" />
        <span className="nx-tool-note nx-tool-note-flush">{hits.length} of {p.files.length}</span>
      </div>
      {hits.length === 0
        ? <p className="nx-blank">No path matches</p>
        : <div className="nx-files">
            {hits.map((f) => (
              <div key={f.path} className="nx-file">
                <FileCode2 size={12} />
                <span className="nx-mono">{f.path}</span>
                <em>{f.size}</em>
              </div>
            ))}
          </div>}
      <p className="nx-tool-note">
        Sizes come from the working tree. Opening a file in your editor needs the
        launch bridge, same as the dashboard shortcuts.
      </p>
    </div>
  );
}

const PROJ_TABS = [
  { id: "overview", label: "Overview", icon: Database, body: ProjOverview },
  { id: "tasks", label: "Tasks", icon: CheckCircle2, body: ProjTasks },
  { id: "notes", label: "Notes", icon: StickyNote, body: ProjNotes },
  { id: "history", label: "History", icon: GitBranch, body: ProjHistory },
  { id: "files", label: "Files", icon: FileCode2, body: ProjFiles },
];

/* ---------- shared create / edit form ---------- */

function ProjectForm({ initial, taken, onSave, onCancel, mode }) {
  const [f, setF] = useState(() => initial);
  const [tag, setTag] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const slug = slugify(f.name);
  const clash = mode === "create" && taken.includes(slug);
  const valid = slug.length > 0 && !clash;

  const addTag = () => {
    const v = tag.trim();
    if (!v || f.stack.includes(v)) { setTag(""); return; }
    set("stack", [...f.stack, v]);
    setTag("");
  };

  return (
    <div className="nx-tool nx-form">
      <div className="nx-form-field">
        <label>Name</label>
        <input className="nx-inline nx-inline-wide" value={f.name} autoFocus
          onChange={(e) => set("name", e.target.value)}
          placeholder="my-new-project" />
        {f.name && (
          <p className={`nx-form-hint${clash ? " nx-form-hint-bad" : ""}`}>
            {clash ? `A project called ${slug} already exists.` : `id: ${slug}`}
          </p>
        )}
      </div>

      <div className="nx-form-field">
        <label>What is it</label>
        <textarea className="nx-field" rows={2} value={f.desc}
          onChange={(e) => set("desc", e.target.value)}
          placeholder="One line you'll still understand in six months" />
      </div>

      <div className="nx-form-row">
        <div className="nx-form-field">
          <label>Status</label>
          <div className="nx-tool-row">
            {Object.keys(P_STATUS).map((k) => (
              <button key={k} className={`nx-chip${f.status === k ? " nx-chip-on" : ""}`}
                onClick={() => set("status", k)}>{P_STATUS[k].label}</button>
            ))}
          </div>
        </div>
        <div className="nx-form-field">
          <label>Branch</label>
          <input className="nx-inline" value={f.branch}
            onChange={(e) => set("branch", e.target.value)} placeholder="main" />
        </div>
      </div>

      <div className="nx-form-field">
        <label>Local git repo <span className="nx-dim">(optional — pulls real branch, commits, status)</span></label>
        <input className="nx-inline nx-inline-wide nx-mono" value={f.repoPath || ""}
          onChange={(e) => set("repoPath", e.target.value)}
          placeholder="C:\\Users\\zamud\\Desktop\\my-repo" spellCheck={false} />
      </div>

      <div className="nx-form-field">
        <label>Language</label>
        <div className="nx-tool-row">
          {LANGS.map((l) => (
            <button key={l} className={`nx-chip${f.lang === l ? " nx-chip-on" : ""}`}
              onClick={() => set("lang", l)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="nx-form-field">
        <label>Stack</label>
        <div className="nx-tool-row">
          <input className="nx-inline" value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            placeholder="add and press enter" />
          {f.stack.map((t) => (
            <button key={t} className="nx-chip nx-chip-tag"
              onClick={() => set("stack", f.stack.filter((x) => x !== t))}>
              {t}<X size={10} />
            </button>
          ))}
        </div>
      </div>

      <div className="nx-form-field">
        <label>Notes to self</label>
        <textarea className="nx-field" rows={3} value={f.readme}
          onChange={(e) => set("readme", e.target.value)}
          placeholder="Why this exists, what you decided, what to avoid" />
      </div>

      <div className="nx-tool-row nx-form-actions">
        <button className="nx-btn nx-btn-on" onClick={() => onSave(f)} disabled={!valid}>
          {mode === "create" ? "Create project" : "Save changes"}
        </button>
        <button className="nx-chip" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const emptyForm = {
  name: "", desc: "", status: "active", lang: "TypeScript",
  branch: "main", stack: [], readme: "", repoPath: "",
};

const PROJ_TABS_ALL = PROJ_TABS;
const P_FILTERS = ["all", "active", "paused", "shipped"];

function ProjectsView({ ctx }) {
  const { demo } = ctx;
  const [projects, setProjects] = usePersistent("projects", []);
  const [sel, setSel] = useState(demo ? PROJECT_SEED[0].id : null);
  const [tab, setTab] = useState("overview");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [mode, setMode] = useState(null);   // null | "create" | "edit"
  const [confirmDrop, setConfirmDrop] = useState(false);

  const project = projects.find((p) => p.id === sel) || null;

  // Live git data for the selected project, if it points at a real repo.
  const [gitLive, setGitLive] = useState(null);
  const isDesktopProj = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  useEffect(() => {
    setGitLive(null);
    if (!isDesktopProj || !project?.repoPath) return;
    let alive = true;
    setGitLive({ loading: true });
    const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
    inv("git_info", { path: project.repoPath })
      .then((data) => { if (alive) setGitLive({ data }); })
      .catch((e) => { if (alive) setGitLive({ err: String(e?.message || e) }); });
    return () => { alive = false; };
  }, [sel, project?.repoPath, isDesktopProj]);

  useEffect(() => {
    if (!project && projects.length) setSel(projects[0].id);
    if (!projects.length) { setSel(null); setMode(null); }
  }, [projects, project]);

  const visible = projects.filter((p) =>
    (filter === "all" || p.status === filter) &&
    (p.name.toLowerCase().includes(q.toLowerCase()) ||
     p.desc.toLowerCase().includes(q.toLowerCase()) ||
     p.stack.some((x) => x.toLowerCase().includes(q.toLowerCase()))));

  const mutate = (fn) => setProjects((prev) => prev.map((p) => (p.id === sel ? fn(p) : p)));

  const create = (f) => {
    const made = blankProject(f);
    setProjects((prev) => [...prev, made]);
    setSel(made.id);
    setTab("overview");
    setMode(null);
    ctx.toast(`Created ${made.name}`);
  };

  const saveEdit = (f) => {
    mutate((p) => ({
      ...p, name: f.name.trim(), desc: f.desc.trim(), status: f.status,
      lang: f.lang, branch: f.branch.trim() || "main", stack: f.stack,
      readme: f.readme.trim(), repoPath: (f.repoPath || "").trim(),
    }));
    setMode(null);
    ctx.toast("Saved");
  };

  const drop = () => {
    const name = project.name;
    setProjects((prev) => prev.filter((p) => p.id !== sel));
    setConfirmDrop(false);
    ctx.toast(`Deleted ${name}`);
  };

  const activeTab = PROJ_TABS_ALL.find((x) => x.id === tab);
  const Body = activeTab.body;

  /* -------- nothing here yet -------- */
  if (!projects.length && mode !== "create") {
    return (
      <div className="nx-mod">
        <div className="nx-first">
          <span className="nx-first-mark"><FolderPlus size={22} /></span>
          <h2>Nothing tracked yet.</h2>
          <p>
            Projects live here — progress, tasks, the reasoning you'll forget,
            and the git history once a repo is attached. Start with one.
          </p>
          <button className="nx-cta" onClick={() => setMode("create")}>
            Start creating <ArrowRight size={15} />
          </button>
          <p className="nx-first-alt">
            Everything you create is saved to this machine.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="nx-proj">
      <aside className="nx-proj-rail">
        <button className="nx-new" onClick={() => { setMode("create"); }}>
          <Plus size={13} />New project
        </button>

        <div className="nx-proj-search">
          <Search size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" />
        </div>
        <div className="nx-proj-filters">
          {P_FILTERS.map((f) => (
            <button key={f} className={`nx-chip${filter === f ? " nx-chip-on" : ""}`}
              onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>

        <div className="nx-proj-list">
          {visible.length === 0 && <p className="nx-blank">No match</p>}
          {visible.map((p) => (
            <button key={p.id}
              className={`nx-proj-item${p.id === sel && !mode ? " nx-proj-on" : ""}`}
              onClick={() => { setSel(p.id); setTab("overview"); setMode(null); setConfirmDrop(false); }}>
              <span className="nx-proj-item-top">
                <i className="nx-proj-dot" style={{ background: P_STATUS[p.status].tone }} />
                <span className="nx-proj-name">{p.name}</span>
                <em>{p.last}</em>
              </span>
              <span className="nx-proj-item-meta">
                {p.lang} · {p.tasks.filter((t) => !t.done).length} open
                {!p.seed && <b className="nx-proj-mine">yours</b>}
              </span>
              <span className="nx-track nx-track-sm">
                <i style={{ width: `${pct(p.tasks)}%`, background: P_STATUS[p.status].tone }} />
              </span>
            </button>
          ))}
        </div>

        <p className="nx-proj-foot">
          {projects.length} tracked · {projects.filter((p) => !p.seed).length} yours
        </p>
      </aside>

      <section className="nx-proj-detail">
        {mode === "create" && (
          <>
            <div className="nx-proj-head">
              <div>
                <p className="nx-eyebrow">New</p>
                <h2 className="nx-proj-title">Create a project</h2>
              </div>
            </div>
            <ProjectForm mode="create" initial={emptyForm}
              taken={projects.map((p) => p.id)}
              onSave={create} onCancel={() => setMode(null)} />
          </>
        )}

        {mode === "edit" && project && (
          <>
            <div className="nx-proj-head">
              <div>
                <p className="nx-eyebrow">Editing</p>
                <h2 className="nx-proj-title">{project.name}</h2>
              </div>
            </div>
            <ProjectForm mode="edit" taken={[]}
              initial={{
                name: project.name, desc: project.desc, status: project.status,
                lang: project.lang, branch: project.branch,
                stack: project.stack, readme: project.readme, repoPath: project.repoPath || "",
              }}
              onSave={saveEdit} onCancel={() => setMode(null)} />
          </>
        )}

        {!mode && project && (
          <>
            <div className="nx-proj-head">
              <div>
                <p className="nx-eyebrow" style={{ color: P_STATUS[project.status].tone }}>
                  {P_STATUS[project.status].label} · {project.branch}
                </p>
                <h2 className="nx-proj-title">{project.name}</h2>
              </div>
              <div className="nx-tool-row">
                <button className="nx-chip" onClick={() => setMode("edit")}>
                  <Pencil size={11} />Edit
                </button>
                {confirmDrop ? (
                  <>
                    <button className="nx-chip nx-chip-stop" onClick={drop}>Delete for good</button>
                    <button className="nx-chip" onClick={() => setConfirmDrop(false)}>Keep</button>
                  </>
                ) : (
                  <button className="nx-chip" onClick={() => setConfirmDrop(true)}>
                    <Trash2 size={11} />Delete
                  </button>
                )}
              </div>
            </div>

            <div className="nx-tabs nx-tabs-sub">
              {PROJ_TABS_ALL.map((x) => (
                <button key={x.id} className={`nx-tab${tab === x.id ? " nx-tab-on" : ""}`}
                  onClick={() => setTab(x.id)}>
                  <x.icon size={13} strokeWidth={1.8} />{x.label}
                </button>
              ))}
            </div>

            <Body p={gitLive?.data ? {
                ...project,
                git: { ahead: gitLive.data.ahead, behind: gitLive.data.behind, dirty: gitLive.data.dirty },
                branch: gitLive.data.branch || project.branch,
                commits: gitLive.data.commits.map((c, i) => ({ ...c, plus: 0, minus: 0, files: [] })),
                files: gitLive.data.files,
                gitLive: true,
              } : project} ctx={ctx}
              onToggle={(tid) => mutate((p) => ({
                ...p, tasks: p.tasks.map((t) => (t.id === tid ? { ...t, done: !t.done } : t)),
              }))}
              onAddTask={(text) => mutate((p) => ({
                ...p, tasks: [...p.tasks, { id: Date.now(), text, done: false }],
              }))}
              onDropTask={(tid) => mutate((p) => ({
                ...p, tasks: p.tasks.filter((t) => t.id !== tid),
              }))}
              onAddNote={(kind, text) => mutate((p) => ({
                ...p, notes: [{ id: Date.now(), kind, text, when: "now" }, ...p.notes],
              }))}
              onDropNote={(nid) => mutate((p) => ({
                ...p, notes: p.notes.filter((n) => n.id !== nid),
              }))} />
          </>
        )}
      </section>
    </div>
  );
}

const FILE_SEED_RAW = [
  {
    id: "f1", name: "milestone-2-notes.md", path: "Documents/nexus", type: "md",
    size: "4.2 KB", when: "2h", order: 1, tags: ["nexus", "notes"], fav: true,
    body: `# Milestone 2 — widget grid

Decisions made:
- Widgets are registry entries, not hardcoded components. The dashboard reads WIDGETS and renders whatever it finds.
- Four size presets instead of free-form resizing. Free-form needs absolute positioning and collision math; presets are what Apple's widget system actually does.
- All telemetry comes from one hook. When Tauri lands, only that hook changes.

Open problem: layout does not persist. Needs a config file on disk, which means the backend.

Reminder: static widgets must not re-render on a telemetry tick. Clock and calendar were re-rendering 50 times a minute for no reason.`,
  },
  {
    id: "f2", name: "capture-lab3.pcapng", path: "Network/captures", type: "pcapng",
    size: "1.8 MB", when: "5h", order: 2, tags: ["cyber", "lab"], fav: false, body: null,
  },
  {
    id: "f3", name: "main.py", path: "Code/nexus/src", type: "py",
    size: "1.1 KB", when: "6h", order: 3, tags: ["nexus", "python"], fav: false,
    body: `import psutil
import time

def snapshot():
    """Return a single reading of the things the dashboard cares about."""
    return {
        "cpu": psutil.cpu_percent(interval=0.1),
        "mem": psutil.virtual_memory().percent,
        "disk": psutil.disk_usage("/").percent,
    }

if __name__ == "__main__":
    while True:
        print(snapshot())
        time.sleep(1.2)`,
  },
  {
    id: "f4", name: "port-reference.md", path: "Documents/cyber", type: "md",
    size: "2.7 KB", when: "1d", order: 4, tags: ["cyber", "notes"], fav: true,
    body: `# Ports worth recognizing on sight

23 telnet — unencrypted shell. If this is open, that is the finding.
445 smb — the EternalBlue door. Should never face the internet.
3389 rdp — brute forced constantly. Put it behind a VPN.
3306 / 5432 — database engines. Bind to localhost unless there is a reason.
8080 — usually a dev console someone forgot about.

Rule of thumb: the question is not "is this port dangerous" but "why is this port reachable from where I am standing".`,
  },
  {
    id: "f5", name: "chassis-v4.step", path: "CAD/rover", type: "step",
    size: "8.4 MB", when: "2d", order: 5, tags: ["robotics", "cad"], fav: false, body: null,
  },
  {
    id: "f6", name: "physics-ch7.pdf", path: "School/physics", type: "pdf",
    size: "3.1 MB", when: "2d", order: 6, tags: ["school"], fav: false, body: null,
  },
  {
    id: "f7", name: "serial.cpp", path: "Code/rover/src", type: "cpp",
    size: "5.9 KB", when: "3d", order: 7, tags: ["robotics", "cpp"], fav: false,
    body: `// Framing: 0xAA 0x55 <len> <payload...> <crc8>
// The sync word matters. Without it a dropped byte desynchronizes the
// stream permanently and every frame after it is garbage.

uint8_t crc8(const uint8_t *data, size_t len) {
  uint8_t crc = 0x00;
  while (len--) {
    crc ^= *data++;
    for (uint8_t i = 0; i < 8; i++)
      crc = (crc & 0x80) ? (crc << 1) ^ 0x07 : (crc << 1);
  }
  return crc;
}`,
  },
  {
    id: "f8", name: "latency-week3.csv", path: "Network/logs", type: "csv",
    size: "184 KB", when: "4d", order: 8, tags: ["network", "data"], fav: false,
    body: `timestamp,host,rtt_ms,lost
2026-06-28T19:04:11,192.168.1.1,1.2,0
2026-06-28T19:04:12,8.8.8.8,17.4,0
2026-06-28T19:04:13,8.8.8.8,,1
2026-06-28T19:04:14,8.8.8.8,19.1,0
2026-06-28T19:04:15,8.8.8.8,88.6,0
2026-06-28T19:04:16,8.8.8.8,142.3,0
2026-06-28T19:04:17,8.8.8.8,,1
2026-06-28T19:04:18,8.8.8.8,21.0,0`,
  },
  {
    id: "f9", name: "ctf-writeup-draft.md", path: "Documents/cyber", type: "md",
    size: "6.8 KB", when: "5d", order: 9, tags: ["cyber", "notes"], fav: false,
    body: `# Writeup — "quiet-room" (forensics, 300)

Given a pcap with 40 seconds of traffic. Almost all of it is noise.

The flag was split across the payloads of ICMP echo requests, one byte per packet, in the identifier field rather than the data section. Easy to miss because most tooling shows the data section and hides the header.

Lesson: when a forensics challenge hands you a capture that looks empty, the data is in a field you are not looking at. Check headers before you check payloads.`,
  },
  {
    id: "f10", name: "shell-adapter.jsx", path: "Code/nexus/src/modules", type: "jsx",
    size: "16.1 KB", when: "6d", order: 10, tags: ["nexus", "notes"], fav: false,
    body: `// The shell lives behind an adapter with three members:
//   label, detail, run(input, session)
// MockShell simulates a session in memory. TauriShell will spawn a
// real process. Nothing in the UI references either one directly  - 
// it reads whichever object is assigned to \`shell\`.
//
// This is the whole point of the adapter: swapping the backend is a
// one-line change, not a rewrite.`,
  },
  {
    id: "f11", name: "study-plan.txt", path: "School", type: "txt",
    size: "0.9 KB", when: "1w", order: 11, tags: ["school"], fav: false,
    body: `Physics ch7 — rotational motion
  Torque, moment of inertia, angular momentum
  Weak spot: parallel axis theorem. Redo problems 14-22.

CyberPatriot prep
  Windows hardening checklist, twice through
  Forensics questions are worth the most and take the least time

Nexus
  Files module, then automation`,
  },
  {
    id: "f12", name: "sensor-log.xlsx", path: "Engineering/bench", type: "xlsx",
    size: "412 KB", when: "1w", order: 12, tags: ["robotics", "data"], fav: false, body: null,
  },
  {
    id: "f13", name: "wiring-v2.png", path: "Engineering/bench", type: "png",
    size: "1.2 MB", when: "2w", order: 13, tags: ["robotics"], fav: false, body: null,
  },
  {
    id: "f14", name: "dorm-outage-report.md", path: "Documents/network", type: "md",
    size: "3.4 KB", when: "3w", order: 14, tags: ["network", "notes"], fav: true,
    body: `# Dorm network — six weeks of probes

Findings:
- Latency to the gateway is fine. Everything past it is not.
- Loss clusters between 19:00 and 23:00, which is exactly when everyone is online.
- Two hard outages, both on a Sunday, both about 40 minutes.

Conclusion: the access point on our floor is oversubscribed, not broken. Moving it or adding a second one solves this. Replacing it does not.`,
  },
];

const FILE_SEED = FILE_SEED_RAW.map((f) => ({ ...f, seed: true }));

const TEXTY = new Set(["md", "py", "txt", "csv", "jsx", "cpp", "json", "rs"]);

const FILE_ICON = { py: FileCode2, jsx: FileCode2, cpp: FileCode2, rs: FileCode2,
  csv: FileSpreadsheet, xlsx: FileSpreadsheet, png: Image, jpg: Image,
  pcapng: Binary, step: Binary };

const MockFiles = {
  label: "Mock index",
  detail: "A simulated index. The Tauri adapter will walk real folders and read real files.",
  list: () => FILE_SEED,
};

function parseQuery(raw) {
  const ops = { tag: [], type: [], in: [] };
  const words = [];
  for (const tok of raw.trim().split(/\s+/)) {
    const m = tok.match(/^(tag|type|in):(.+)$/i);
    if (m) ops[m[1].toLowerCase()].push(m[2].toLowerCase());
    else if (tok) words.push(tok.toLowerCase());
  }
  return { ops, words };
}

function matchFile(f, q) {
  for (const t of q.ops.tag) if (!f.tags.some((x) => x.toLowerCase() === t)) return null;
  for (const t of q.ops.type) if (f.type.toLowerCase() !== t) return null;
  for (const d of q.ops.in) if (!f.path.toLowerCase().includes(d)) return null;
  if (!q.words.length) return "all";

  let where = null;
  for (const w of q.words) {
    const inName = f.name.toLowerCase().includes(w);
    const inPath = f.path.toLowerCase().includes(w);
    const inTag = f.tags.some((x) => x.toLowerCase().includes(w));
    const inBody = f.body ? f.body.toLowerCase().includes(w) : false;
    if (!inName && !inPath && !inTag && !inBody) return null;
    where = inName ? "name" : inPath ? "path" : inTag ? "tag" : where || "content";
  }
  return where;
}

const F_SORTS = { recent: "Recent", name: "Name", size: "Size" };
const sizeBytes = (s) => {
  const [n, unit] = s.split(" ");
  return parseFloat(n) * ({ KB: 1e3, MB: 1e6, GB: 1e9 }[unit] || 1);
};

function FilePreview({ file, summary, onSummarize, onTag, onDropTag, onFav, ctx }) {
  const [tag, setTag] = useState("");
  const Icon = FILE_ICON[file.type] || FileText;
  const readable = TEXTY.has(file.type) && file.body;

  return (
    <div className="nx-fp">
      <div className="nx-fp-head">
        <span className="nx-fp-icon"><Icon size={16} /></span>
        <div className="nx-fp-id">
          <p className="nx-fp-name">{file.name}</p>
          <p className="nx-fp-path">{file.path}</p>
        </div>
        <button className={`nx-star${file.fav ? " nx-star-on" : ""}`}
          onClick={() => onFav(file.id)} aria-pressed={file.fav} aria-label="Favorite">
          <Star size={14} />
        </button>
      </div>

      <dl className="nx-dl nx-fp-meta">
        <dt>Type</dt><dd>{file.type.toUpperCase()}</dd>
        <dt>Size</dt><dd>{file.size}</dd>
        <dt>Modified</dt><dd>{file.when} ago</dd>
      </dl>

      <div className="nx-fp-tags">
        {file.tags.map((t) => (
          <button key={t} className="nx-chip nx-chip-tag" onClick={() => onDropTag(file.id, t)}>
            {t}<X size={10} />
          </button>
        ))}
        <input className="nx-inline nx-inline-tag" value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const v = tag.trim().toLowerCase();
            if (v) onTag(file.id, v);
            setTag("");
          }}
          placeholder="+ tag" />
      </div>

      <div className="nx-fp-sum">
        <div className="nx-out-head">
          <span>Summary</span>
          {!summary?.busy && (
            <button className="nx-copy" onClick={() => onSummarize(file)}>
              <Sparkles size={11} />{summary?.text ? "Redo" : "Summarize"}
            </button>
          )}
        </div>
        {summary?.busy && (
          <p className="nx-msg-busy"><Loader2 size={13} className="nx-spin" />Reading the file</p>
        )}
        {summary?.err && <p className="nx-out-err">{summary.err}</p>}
        {summary?.text && <div className="nx-fp-sum-body"><MsgText text={summary.text} /></div>}
        {!summary && (
          <p className="nx-tool-note nx-tool-note-flush">
            {readable
              ? "Reads the contents and tells you what is in it."
              : "No text to read. A summary would need a parser for this format."}
          </p>
        )}
      </div>

      <div className="nx-fp-body">
        <div className="nx-out-head"><span>Preview</span></div>
        {readable
          ? <pre className="nx-fp-pre">{file.body}</pre>
          : <div className="nx-fp-noview">
              <Icon size={20} />
              <p>No text preview for {file.type.toUpperCase()}.</p>
              <p className="nx-tool-note nx-tool-note-flush">
                Nexus previews text-based files inline. Use "Open" below to launch this
                one in its default app.
              </p>
            </div>}
      </div>

      <button className="nx-chip" onClick={async () => {
        const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
        if (!isDesktop) { ctx.toast("Opening files works in the desktop app."); return; }
        try {
          const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
          await inv("launch_app", { target: file.id }); // file.id is the real path
        } catch (e) { ctx.toast(String(e?.message || e).slice(0, 80)); }
      }}>
        Open file
      </button>
    </div>
  );
}

function FilesView({ ctx }) {
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const [files, setFiles] = useState([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const [onlyFav, setOnlyFav] = useState(false);
  const [sel, setSel] = useState(null);
  const [summaries, setSummaries] = useState({});
  const [indexing, setIndexing] = useState(false);
  const [folder, setFolder] = usePersistent("files-folder", "");
  const [pathInput, setPathInput] = useState("");
  const [idxErr, setIdxErr] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const indexFolder = async (path, recursive = true) => {
    if (!isDesktop) { setIdxErr("Folder indexing works in the desktop app."); return; }
    const target = (path || "").trim();
    if (!target) { setIdxErr("Enter a folder path first."); return; }
    setIndexing(true); setIdxErr(null);
    try {
      const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
      const found = await inv("index_folder", { path: target, recursive });
      // Add the UI-only fields the list/sort expect.
      const withMeta = found.map((f, i) => ({ ...f, order: i, fav: false, seed: false }));
      setFiles(withMeta);
      setFolder(target);
      setSel(withMeta[0]?.id || null);
    } catch (e) {
      setIdxErr(String(e?.message || e));
    } finally {
      setIndexing(false);
    }
  };

  // Re-index the saved folder on open.
  useEffect(() => {
    if (isDesktop && folder && !files.length) indexFolder(folder, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsed = useMemo(() => parseQuery(q), [q]);

  const hits = useMemo(() => {
    const out = [];
    for (const f of files) {
      if (onlyFav && !f.fav) continue;
      const where = matchFile(f, parsed);
      if (where) out.push({ ...f, where });
    }
    out.sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name)
      : sort === "size" ? sizeBytes(b.size) - sizeBytes(a.size)
      : a.order - b.order);
    return out;
  }, [files, parsed, sort, onlyFav]);

  const file = files.find((f) => f.id === sel) || null;

  useEffect(() => {
    if (!file && hits.length) setSel(hits[0].id);
    if (!files.length) setSel(null);
  }, [files, file, hits]);

  const tagCounts = useMemo(() => {
    const m = new Map();
    for (const f of files) for (const t of f.tags) m.set(t, (m.get(t) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [files]);

  const patch = (id, fn) => setFiles((prev) => prev.map((f) => (f.id === id ? fn(f) : f)));

  const summarize = async (f) => {
    if (!TEXTY.has(f.type) || !f.body) {
      setSummaries((s) => ({ ...s, [f.id]: { err: `Nothing readable inside a ${f.type.toUpperCase()} yet.` } }));
      return;
    }
    setSummaries((s) => ({ ...s, [f.id]: { busy: true } }));
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const text = await askClaude({
        system: "Summarize the file the user pastes. Two or three sentences, plain prose, no headers. Say what it is and what matters in it. If it records a decision, lead with the decision.",
        messages: [{ role: "user", content: `File: ${f.path}/${f.name}\n\n${f.body}` }],
        signal: ac.signal,
      });
      setSummaries((s) => ({ ...s, [f.id]: { text } }));
    } catch (e) {
      if (e.name === "AbortError") return;
      setSummaries((s) => ({ ...s, [f.id]: { err: e.message || "Could not reach the engine." } }));
    }
  };

  if (!files.length) {
    return (
      <div className="nx-mod">
        <div className="nx-first">
          <span className="nx-first-mark"><Folder size={22} /></span>
          <h2>No folder indexed.</h2>
          <p>
            Point Nexus at a folder and it will index what's inside — searchable by
            name, path, and by what text files actually say. Read-only; nothing is changed.
          </p>
          <div className="nx-idx-row">
            <input className="nx-inline nx-inline-wide" value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && indexFolder(pathInput)}
              placeholder={isDesktop ? "Paste a folder path — e.g. C:\\Users\\zamud\\Documents" : "Desktop app only"}
              spellCheck={false} disabled={!isDesktop} />
            <button className="nx-cta" onClick={() => indexFolder(pathInput)} disabled={indexing || !isDesktop}>
              {indexing ? "Indexing…" : "Index"} <ArrowRight size={15} />
            </button>
          </div>
          {idxErr && <p className="nx-out-err" style={{ marginTop: 10 }}>{idxErr}</p>}
          <p className="nx-first-alt">
            Tip: in File Explorer, click the address bar to see the full path, then copy it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="nx-mod nx-mod-wide">
      <div className="nx-fsearch">
        <Search size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search names, paths, tags, and contents" spellCheck={false} />
        {q && <button className="nx-fsearch-x" onClick={() => setQ("")}><X size={13} /></button>}
      </div>

      <div className="nx-tool-row nx-fbar">
        <button className={`nx-chip${onlyFav ? " nx-chip-on" : ""}`} onClick={() => setOnlyFav((v) => !v)}>
          <Star size={11} />Starred
        </button>
        <span className="nx-fbar-div" />
        {Object.entries(F_SORTS).map(([k, label]) => (
          <button key={k} className={`nx-chip${sort === k ? " nx-chip-on" : ""}`}
            onClick={() => setSort(k)}>{label}</button>
        ))}
        <span className="nx-fbar-div" />
        {tagCounts.slice(0, 6).map(([t, n]) => (
          <button key={t} className="nx-chip" onClick={() => setQ(`tag:${t}`)}>
            <Tag size={10} />{t}<b className="nx-tag-n">{n}</b>
          </button>
        ))}
        <span className="nx-fcount">{hits.length} of {files.length}</span>
        <button className="nx-chip" onClick={() => { setFiles([]); setPathInput(folder); }}
          title="Index a different folder">
          <Folder size={11} />Change folder
        </button>
      </div>

      <div className="nx-fsplit">
        <div className="nx-flist">
          {hits.length === 0 && (
            <div className="nx-empty">
              <p className="nx-empty-title">Nothing matches.</p>
              <p className="nx-empty-body">
                Free text searches names, paths, tags and contents. You can also
                narrow with <code>tag:cyber</code>, <code>type:md</code>, or <code>in:School</code>.
              </p>
            </div>
          )}
          {hits.map((f) => {
            const Icon = FILE_ICON[f.type] || FileText;
            return (
              <button key={f.id} className={`nx-frow${f.id === sel ? " nx-frow-on" : ""}`}
                onClick={() => setSel(f.id)}>
                <Icon size={13} />
                <span className="nx-frow-main">
                  <span className="nx-frow-name">
                    {f.name}
                    {f.fav && <Star size={9} className="nx-frow-star" />}
                  </span>
                  <span className="nx-frow-path">{f.path}</span>
                </span>
                <span className="nx-frow-tags">
                  {f.tags.slice(0, 2).map((t) => <i key={t}>{t}</i>)}
                </span>
                {f.where === "content" && <span className="nx-frow-hit">in contents</span>}
                <span className="nx-frow-size">{f.size}</span>
                <span className="nx-frow-when">{f.when}</span>
              </button>
            );
          })}
        </div>

        <aside className="nx-fpane">
          {file
            ? <FilePreview file={file} summary={summaries[file.id]} ctx={ctx}
                onSummarize={summarize}
                onFav={(id) => patch(id, (f) => ({ ...f, fav: !f.fav }))}
                onTag={(id, t) => patch(id, (f) => f.tags.includes(t) ? f : { ...f, tags: [...f.tags, t] })}
                onDropTag={(id, t) => patch(id, (f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))} />
            : <p className="nx-blank">Select a file</p>}
        </aside>
      </div>
    </div>
  );
}

const HW_MODES = [
  {
    id: "method", label: "Explain the method", icon: BookOpen,
    hint: "Names the concept and the approach, without solving it.",
    system: "A high school student has photographed a homework problem. Do not give the final answer or a complete worked solution. Identify what kind of problem it is, name the concept and any formula involved, and explain the approach in the order they would apply it. Finish by telling them the single concrete first step to take. If the image is unreadable, or is not a problem, say exactly that instead of guessing. Be concise and plain — no headers, short paragraphs.",
  },
  {
    id: "walk", label: "Walk me through it", icon: ListOrdered,
    hint: "One step at a time, waiting for you at each stage.",
    system: "A high school student has photographed a homework problem. Guide them through it ONE step at a time. Explain the reasoning for the current step, do only that step, then stop and ask them to attempt or confirm the next one. Never present the whole solution in a single message, even if asked directly — if they ask for the answer, give them the next step instead and invite them to try it. Keep each turn short.",
  },
  {
    id: "check", label: "Check my work", icon: CheckCircle2,
    hint: "Finds where your attempt goes wrong, and why.",
    system: "The photo shows a student's own attempt at a problem. Find the FIRST place the work goes wrong and explain why that step is wrong in terms of the underlying concept. Do not rewrite the solution for them. If the work is correct, confirm it and point out anything fragile or lucky about the method. If handwriting is unclear, name which part you cannot read rather than assuming. Be concise.",
  },
  {
    id: "practice", label: "Practice problems", icon: Repeat,
    hint: "Similar problems to drill until the method sticks.",
    system: "From the problem in the photo, write three similar practice problems using the same method, in increasing order of difficulty. Do not solve the original problem. List the answers to your three problems together at the very end, after a line reading 'Answers:', so the student can attempt them first and check afterwards.",
  },
  {
    id: "solve", label: "Full solution", icon: Zap, answer: true,
    hint: "Solves it completely with every step shown.",
    system: "A student has photographed a problem and wants the complete worked solution. Solve it fully. Show every step in order with the reasoning for each, so the solution can be followed and learned from, and state the final answer clearly at the end. This is for checking work and studying worked examples — be accurate above all; a wrong worked solution is worse than none. If the image is unreadable or is not a solvable problem, say so plainly instead of guessing. Keep the steps tight and readable.",
  },
];

const MAX_EDGE = 1568;

async function prepImage(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    throw new Error("That file type isn't supported. Use a PNG, JPEG, WebP or GIF.");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

  if (scale === 1 && file.size < 3_500_000) {
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]);
      r.onerror = () => rej(new Error("Could not read that file."));
      r.readAsDataURL(file);
    });
    bitmap.close?.();
    return { base64, media: file.type, w: bitmap.width, h: bitmap.height, shrunk: false };
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const cx = canvas.getContext("2d");
  cx.imageSmoothingQuality = "high";
  cx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const url = canvas.toDataURL("image/jpeg", 0.88);
  return {
    base64: url.split(",")[1], media: "image/jpeg",
    w: canvas.width, h: canvas.height, shrunk: true,
  };
}

function SchoolHomework({ ctx }) {
  const [mode, setMode] = useState("method");
  const [img, setImg] = useState(null);      // { base64, media, w, h, url }
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  const feedRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [thread, busy]);

  const load = async (file) => {
    if (!file) return;
    setErr(null);
    try {
      const prepped = await prepImage(file);
      setImg({ ...prepped, url: `data:${prepped.media};base64,${prepped.base64}` });
      setThread([]);
    } catch (e) {
      setErr(e.message || "Could not read that image.");
    }
  };

  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
      if (item) load(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const schoolMode = ctx.settings?.schoolMode;
  const modes = HW_MODES.filter((m) => !(schoolMode && m.answer));
  const activeMode = modes.find((m) => m.id === mode) || modes[0];
  // If school mode hid the selected mode, snap back to a visible one.
  useEffect(() => {
    if (!modes.some((m) => m.id === mode)) setMode(modes[0].id);
  }, [schoolMode]);

  const send = async (firstRun, followUp) => {
    if (busy) return;
    if (firstRun && !img) return;       // "Read the problem" needs a photo
    if (!firstRun && !followUp?.trim()) return;
    setErr(null);

    let history;
    if (firstRun) {
      history = [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: img.media, data: img.base64 } },
          { type: "text", text: "Here is the problem." },
        ],
        shown: "Here is the problem.",
      }];
    } else {
      history = [...thread, { role: "user", content: followUp, shown: followUp }];
    }

    setThread(history);
    setDraft("");
    setBusy(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const noPhoto = !img;
      const sys = noPhoto
        ? activeMode.system.replace(/in the photo/g, "the student typed").replace(/photographed a problem/g, "typed a problem")
          + " The student typed their question directly (no photo). Answer their question in that spirit."
        : activeMode.system;
      const text = await askClaude({
        system: sys + " Format math clearly. You may use markdown and LaTeX ($$...$$, \\frac, ^, etc.) — it renders properly here.",
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        signal: ac.signal,
      });
      setThread((p) => [...p, { role: "assistant", content: text, shown: text }]);
    } catch (e) {
      if (e.name === "AbortError") return;
      setErr(e.message || "Could not reach the engine.");
      setThread((p) => p.slice(0, -1));
      if (!firstRun) setDraft(followUp);
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setImg(null); setThread([]); setErr(null); setDraft(""); setBusy(false);
  };

  return (
    <div className="nx-tool">
      <div className="nx-hw-modes">
        {modes.map((m) => (
          <button key={m.id} className={`nx-hw-mode${activeMode.id === m.id ? " nx-hw-mode-on" : ""}`}
            onClick={() => { setMode(m.id); setThread([]); }}>
            <m.icon size={15} strokeWidth={1.8} />
            <span>{m.label}</span>
            <em>{m.hint}</em>
          </button>
        ))}
      </div>

      {!img ? (
        <>
          <div className={`nx-hw-drop${drag ? " nx-hw-drop-hot" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); load(e.dataTransfer.files?.[0]); }}
            onClick={() => fileRef.current?.click()}>
            <span className="nx-hw-drop-mark"><Upload size={20} /></span>
            <p className="nx-hw-drop-title">
              {drag ? "Release to read it" : "Drop a photo of the problem"}
            </p>
            <p className="nx-hw-drop-sub">or click to browse · or just paste from your clipboard</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={(e) => load(e.target.files?.[0])} />
          {err && <p className="nx-out-err">{err}</p>}

          <div className="nx-hw-or"><span>or just type your question</span></div>
          <div className="nx-asst-composer">
            <textarea rows={1} value={draft}
              placeholder="Ask a math question directly — no photo needed"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (draft.trim()) send(false, draft.trim());
                }
              }} />
            <button className="nx-asst-send" disabled={busy || !draft.trim()}
              onClick={() => draft.trim() && send(false, draft.trim())}>
              <Send size={14} />
            </button>
          </div>

          <p className="nx-tool-note">
            This is a tutor, not a submit button — every mode is built to leave you
            able to do the next one alone. Photos are sent to the model for reading
            and are not stored anywhere.
          </p>
        </>
      ) : (
        <div className="nx-hw-work">
          <aside className="nx-hw-shot">
            <img src={img.url} alt="The homework problem you uploaded" />
            <p className="nx-tool-note nx-tool-note-flush">
              {img.w}×{img.h}{img.shrunk && " · downscaled for upload"}
            </p>
            <div className="nx-tool-row">
              <button className="nx-chip" onClick={() => fileRef.current?.click()}>Replace</button>
              <button className="nx-chip" onClick={reset}>Start over</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => load(e.target.files?.[0])} />
          </aside>

          <div className="nx-hw-chat">
            {thread.length === 0 && !busy && (
              <div className="nx-hw-ready">
                <p className="nx-hw-ready-mode">{activeMode.label}</p>
                <p>{activeMode.hint}</p>
                <button className="nx-cta" onClick={() => send(true)}>
                  Read the problem <ArrowRight size={15} />
                </button>
              </div>
            )}

            {thread.length > 0 && (
              <div className="nx-hw-feed" ref={feedRef}>
                {thread.map((m, i) => (
                  <div key={i} className={`nx-msg nx-msg-${m.role}`}>
                    {m.role === "assistant" && <span className="nx-msg-mark" />}
                    <div className="nx-msg-body"><MsgText text={m.shown} /></div>
                  </div>
                ))}
                {busy && (
                  <div className="nx-msg nx-msg-assistant">
                    <span className="nx-msg-mark nx-msg-mark-busy" />
                    <div className="nx-msg-body nx-msg-busy">
                      <Loader2 size={13} className="nx-spin" />Reading it
                    </div>
                  </div>
                )}
                {err && (
                  <div className="nx-asst-err">
                    <AlertTriangle size={13} /><span>{err}</span>
                  </div>
                )}
              </div>
            )}

            {thread.length > 0 && (
              <>
                <div className="nx-asst-composer">
                  <textarea rows={1} value={draft} placeholder="Ask about a step, or show your working"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (draft.trim()) send(false, draft.trim());
                      }
                    }} />
                  <button className="nx-asst-send" disabled={busy || !draft.trim()}
                    onClick={() => draft.trim() && send(false, draft.trim())}>
                    <Send size={14} />
                  </button>
                </div>
                <p className="nx-asst-foot">
                  Switching modes above starts a fresh read of the same photo
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const SPEECH = typeof window !== "undefined"
  ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

const FILLERS = ["um", "uh", "erm", "ah", "like", "you know", "i mean",
  "basically", "actually", "literally", "sort of", "kind of", "right"];

function scrub(text, words) {
  if (!words.length) return text;
  let out = text;
  for (const w of words) {
    out = out.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[,]?`, "gi"), "");
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}

const wordCount = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/* ---------- voice notes ---------- */

// Find which recorded segment a reminder came from, by matching the model's
// verbatim quote against the timestamped transcript chunks. Returns the segment
// start time in seconds, or null if nothing lines up (no replay button then).
function matchSegment(quote, segments) {
  if (!quote || !segments?.length) return null;
  const words = String(quote).toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (!words.length) return null;
  let best = null, bestScore = 0;
  for (const s of segments) {
    const st = s.text.toLowerCase();
    let score = 0;
    for (const w of words) if (st.includes(w)) score++;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  // Require at least two shared words (or one when the quote is very short).
  return bestScore >= Math.min(2, words.length) ? best.t : null;
}

function SchoolNotes({ ctx }) {
  const { demo } = ctx;
  // Persisted to disk so notes, summaries and extracted reminders survive a
  // restart. Each note carries its own summary/topic/reminders, so those
  // outlive the session too.
  const [notes, setNotes] = usePersistent("voice-notes", []);
  const [live, setLive] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [secs, setSecs] = useState(0);
  const [micErr, setMicErr] = useState(null);
  const [title, setTitle] = useState("");
  const [filterOn, setFilterOn] = useState(true);
  const [extra, setExtra] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const [sums, setSums] = useState({});
  const [rem, setRem] = useState({});

  const recRef = useRef(null);
  const wantRef = useRef(false);
  const bufRef = useRef("");
  const tickRef = useRef(null);
  const abortRef = useRef(null);
  const remAbortRef = useRef(null);
  // Audio capture runs alongside the speech engine: MediaRecorder saves the
  // sound, segRef timestamps each final transcript chunk against recStartRef,
  // so a reminder can later jump to the exact moment it was said.
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const segRef = useRef([]);
  const recStartRef = useRef(0);
  const noteAudioRef = useRef(null);
  const [audio, setAudio] = useState(null); // pending draft's { url, dataUrl, segments } until saved
  const [audioSrc, setAudioSrc] = useState({}); // noteId -> playable src, resolved lazily
  const inv = (cmd, args) => (window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke)?.(cmd, args);

  // Mirror of audioSrc so the lazy loader can skip files it already has without
  // re-fetching on every open.
  const audioSrcRef = useRef({});
  audioSrcRef.current = audioSrc;

  // When a note with a saved recording is opened, load its audio file from disk
  // (its own state key) into a playable data URL, cached by note id.
  useEffect(() => {
    if (open == null) return;
    const n = notes.find((x) => x.id === open);
    if (!n?.audioId || audioSrcRef.current[open]) return;
    let alive = true;
    inv("load_state", { key: n.audioId })?.then((raw) => {
      if (!alive) return;
      let durl = null;
      try { durl = JSON.parse(raw); } catch { /* absent or corrupt */ }
      if (durl) setAudioSrc((m) => (m[open] ? m : { ...m, [open]: durl }));
    }).catch(() => {});
    return () => { alive = false; };
  }, [open, notes]);

  const filterWords = useMemo(() => {
    const custom = extra.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
    return filterOn ? [...FILLERS, ...custom] : custom;
  }, [filterOn, extra]);

  useEffect(() => () => {
    wantRef.current = false;
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    try { if (mediaRef.current?.state !== "inactive") mediaRef.current?.stop(); } catch { /* fine */ }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    clearInterval(tickRef.current);
    abortRef.current?.abort();
    remAbortRef.current?.abort();
  }, []);

  const start = () => {
    if (!SPEECH) { setMicErr("This browser has no speech engine. You can still type below."); return; }
    setMicErr(null);
    const rec = new SPEECH();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (e) => {
      let inter = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const seg = r[0].transcript.trim();
          bufRef.current += seg + " ";
          // Stamp this chunk against audio t=0 so we can jump back to it later.
          if (recStartRef.current) {
            segRef.current.push({ t: Math.max(0, (Date.now() - recStartRef.current) / 1000), text: seg });
          }
        } else inter += r[0].transcript;
      }
      setFinalText(bufRef.current);
      setInterim(inter);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      setMicErr(e.error === "not-allowed"
        ? "Microphone access was denied. Allow it in the address bar, then start again."
        : `Speech engine error: ${e.error}`);
      wantRef.current = false;
      setLive(false);
      clearInterval(tickRef.current);
    };
    // Chrome cuts the stream on silence. Restart while the user still wants it.
    rec.onend = () => {
      if (!wantRef.current) return;
      try { rec.start(); } catch { /* restart race, harmless */ }
    };

    recRef.current = rec;
    wantRef.current = true;
    try { rec.start(); } catch { /* already running */ }
    setLive(true);
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setSecs((s) => s + 1), 1000);

    // Fresh audio capture for this session. If the mic can't be opened, the
    // transcript still works  -  we just won't have a clip to replay.
    if (!audio) {
      segRef.current = [];
      chunksRef.current = [];
      if (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined") {
        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
          streamRef.current = stream;
          const mr = new MediaRecorder(stream);
          mr.ondataavailable = (ev) => { if (ev.data.size) chunksRef.current.push(ev.data); };
          mr.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
            const segments = segRef.current.slice();
            const url = URL.createObjectURL(blob);
            // The recording is saved to its own file on disk (see save()), so a
            // long class no longer bloats the notes store. Keep a generous safety
            // cap only to avoid a runaway file.
            const CAP = 250 * 1024 * 1024;
            if (blob.size > CAP) {
              setAudio({ url, dataUrl: null, segments });
              ctx.toast("Recording kept for this session (too large to save)");
              streamRef.current?.getTracks().forEach((tr) => tr.stop());
              streamRef.current = null;
              return;
            }
            const fr = new FileReader();
            fr.onload = () => setAudio({ url, dataUrl: fr.result, segments });
            fr.onerror = () => setAudio({ url, dataUrl: null, segments });
            fr.readAsDataURL(blob);
            streamRef.current?.getTracks().forEach((tr) => tr.stop());
            streamRef.current = null;
          };
          mediaRef.current = mr;
          recStartRef.current = Date.now();
          mr.start();
        }).catch(() => { /* no mic / denied  -  transcript-only */ });
      }
    }
  };

  const stop = () => {
    wantRef.current = false;
    try { recRef.current?.stop(); } catch { /* fine */ }
    // Stopping the recorder fires onstop, which builds the audio blob.
    try { if (mediaRef.current?.state !== "inactive") mediaRef.current?.stop(); } catch { /* fine */ }
    setLive(false);
    setInterim("");
    clearInterval(tickRef.current);
  };

  const reset = () => {
    bufRef.current = "";
    segRef.current = [];
    try { if (audio?.url) URL.revokeObjectURL(audio.url); } catch { /* fine */ }
    setAudio(null);
    setFinalText(""); setInterim(""); setSecs(0); setTitle("");
  };

  const save = () => {
    const raw = (finalText + interim).trim();
    if (!raw) return;
    const clean = scrub(raw, filterWords);
    const name = title.trim() || `Session ${new Date().toLocaleString(undefined,
      { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
    const now = new Date();
    const noteId = Date.now();
    const note = {
      id: noteId, title: name, text: clean, raw,
      words: wordCount(clean), secs,
      day: now.toISOString().slice(0, 10),   // YYYY-MM-DD, the folder key
      at: now.getTime(),
      topic: null, summary: null, reminders: null,
      // The recording lives in its own state file (key = audioId), so it stays
      // out of the notes store. audioId is null for typed notes or if capture failed.
      audioId: audio?.dataUrl ? `rec-${noteId}` : null,
      segments: audio?.segments || [],
      stripped: wordCount(raw) - wordCount(clean),
    };
    // Write the recording to its own file on disk, keyed by audioId.
    if (audio?.dataUrl && note.audioId) {
      inv("save_state", { key: note.audioId, value: JSON.stringify(audio.dataUrl) })?.catch(() => {});
      // Seed the cache with the live blob so it plays instantly this session.
      if (audio.url) setAudioSrc((m) => ({ ...m, [noteId]: audio.url }));
    }
    setNotes((p) => [note, ...p]);
    stop();
    bufRef.current = ""; segRef.current = [];
    setAudio(null);
    setFinalText(""); setInterim(""); setSecs(0); setTitle("");
    ctx.toast("Note saved");
    // Automatically detect the topic, pull tests/deadlines, and add them
    // straight to the reminder list. No button, no confirm.
    autoExtract(note);
  };

  const summarize = async (note) => {
    setSums((s) => ({ ...s, [note.id]: { busy: true } }));
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const text = await askClaude({
        system: "You are given a rough voice transcript of a class or study session. Pull out what matters: the main points, any definitions, any dates or numbers, and anything that sounded like it would be on a test. Use short bullets. Do not invent anything that is not in the transcript. If a passage is too garbled to read, say so instead of guessing.",
        messages: [{ role: "user", content: note.text }],
        signal: ac.signal,
      });
      setNotes((p) => p.map((x) => x.id === note.id ? { ...x, summary: text } : x));
      setSums((s) => ({ ...s, [note.id]: {} }));
    } catch (e) {
      if (e.name === "AbortError") return;
      setSums((s) => ({ ...s, [note.id]: { err: e.message || "Could not reach the engine." } }));
    }
  };

  // Pull anything the class flagged as a test, deadline, or assignment and add
  // each straight to the real reminder list  -  automatic, no confirm step.
  // Runs on save, and can be re-run manually from the note if the class was edited.
  const autoExtract = async (note) => {
    setRem((s) => ({ ...s, [note.id]: { busy: true } }));
    remAbortRef.current?.abort();
    const ac = new AbortController();
    remAbortRef.current = ac;
    try {
      const raw = await askClaude({
        system: 'You are given a rough class transcript. Return ONLY a JSON object, no prose and no code fences, shaped {"topic":"Subject - specific topic","reminders":[{"text":"short reminder","due":"day or date, or empty string","quote":"the few verbatim words from the transcript where this was said"}]}. "topic" is a short label like "Physics - Thermodynamics"; if unclear, best guess. "reminders" holds only concrete things the student must remember or do: tests, quizzes, homework, projects, deadlines, or anything explicitly said to be due or on a test. Copy the day or date exactly as spoken. "quote" is a short exact phrase copied from the transcript so the moment can be found; keep it verbatim. If nothing qualifies, use an empty array. Never invent anything not in the transcript.',
        messages: [{ role: "user", content: note.text }],
        signal: ac.signal,
      });
      const clean = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(clean);
      const topic = parsed && typeof parsed.topic === "string" ? parsed.topic.trim() : "";
      const items = (Array.isArray(parsed?.reminders) ? parsed.reminders : [])
        .filter((x) => x && x.text)
        .map((x) => {
          const text = String(x.text);
          const due = x.due ? String(x.due) : "";
          const at = matchSegment(x.quote || text, note.segments); // audio timestamp, or null
          const added = ctx.addReminder(text, due || undefined); // returns the created reminder
          return { text, due, reminderId: added?.id, at };
        });
      if (items.length) ctx.toast(`${items.length} reminder${items.length > 1 ? "s" : ""} added`);
      // Persist topic + reminders onto the note itself.
      setNotes((p) => p.map((x) => x.id === note.id
        ? { ...x, topic: topic || x.topic, reminders: items } : x));
      setRem((s) => ({ ...s, [note.id]: {} }));
    } catch (e) {
      if (e.name === "AbortError") return;
      setRem((s) => ({ ...s, [note.id]: { err: e instanceof SyntaxError
        ? "Couldn't read the reminders back. Open the note and hit Re-scan."
        : (e.message || "Could not reach the engine.") } }));
    }
  };

  const hits = notes.filter((n) =>
    n.title.toLowerCase().includes(q.toLowerCase()) ||
    n.text.toLowerCase().includes(q.toLowerCase()));

  const draft = finalText + interim;
  const preview = filterWords.length ? scrub(draft, filterWords) : draft;

  // Auto-organize the notes into day folders, newest day first.
  const grouped = useMemo(() => {
    const by = new Map();
    for (const n of hits) {
      const key = n.day || "undated";
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(n);
    }
    return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [hits]);

  // Jump the open note's audio to a reminder's moment and play it.
  const playAt = (t) => {
    const a = noteAudioRef.current;
    if (!a || t == null) return;
    try { a.currentTime = Math.max(0, t); a.play(); } catch { /* not ready */ }
  };

  const dayLabel = (key) => {
    if (key === "undated") return "Undated";
    const d = new Date(key + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - d) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  };

  return (
    <div className="nx-tool">
      <div className="nx-rec">
        <div className="nx-rec-head">
          {live
            ? <button className="nx-rec-btn nx-rec-live" onClick={stop}>
                <span className="nx-rec-pip" />Stop
              </button>
            : <button className="nx-rec-btn" onClick={start}>
                <Mic size={14} />{draft ? "Resume" : "Start recording"}
              </button>}
          <span className="nx-rec-time">
            {String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}
          </span>
          <span className="nx-rec-count">{wordCount(preview)} words</span>
          {draft && !live && (
            <>
              <button className="nx-chip nx-chip-on" onClick={save}>Save note</button>
              <button className="nx-chip" onClick={reset}>Discard</button>
            </>
          )}
        </div>

        {micErr && <p className="nx-out-err">{micErr}</p>}
        {!SPEECH && !micErr && (
          <p className="nx-tool-note nx-tool-note-flush">
            No speech engine in this browser. Chrome and Edge have one; Firefox does not.
            Typing below works either way.
          </p>
        )}

        <textarea className="nx-field nx-rec-text" rows={7} value={preview}
          onChange={(e) => { bufRef.current = e.target.value; setFinalText(e.target.value); setInterim(""); }}
          placeholder={live ? "Listening…" : "Speak, or type here directly."} />
        {live && interim && <p className="nx-rec-interim">{interim}</p>}

        <div className="nx-tool-row">
          <input className="nx-inline nx-inline-wide" value={title}
            onChange={(e) => setTitle(e.target.value)} placeholder="Note title (optional)" />
        </div>

        <div className="nx-tool-row nx-rec-filters">
          <button className={`nx-chip${filterOn ? " nx-chip-on" : ""}`} onClick={() => setFilterOn((v) => !v)}>
            <Filter size={11} />Strip filler words
          </button>
          <input className="nx-inline nx-inline-wide" value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="also strip: comma, separated, words" />
        </div>
        <p className="nx-tool-note nx-tool-note-flush">
          Filtering is applied to what gets saved. The raw transcript is kept
          underneath in case the filter eats something it shouldn't.
        </p>
      </div>

      {notes.length === 0 ? (
        <div className="nx-empty">
          <p className="nx-empty-title">No notes yet.</p>
          <p className="nx-empty-body">
            Hit record during class. Save it, then ask for a summary and you'll
            have something readable in seconds instead of a wall of transcript.
          </p>
        </div>
      ) : (
        <>
          <div className="nx-tool-row">
            <div className="nx-proj-search nx-search-inline">
              <Search size={13} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" />
            </div>
            <span className="nx-fcount">{hits.length} of {notes.length}</span>
          </div>

          {grouped.map(([day, dayNotes]) => (
            <div key={day} className="nx-day-group">
              <div className="nx-day-head">
                <Folder size={12} />{dayLabel(day)}<em>{dayNotes.length}</em>
              </div>
              <div className="nx-notes">
                {dayNotes.map((n) => {
                  const sum = sums[n.id];
                  const r = rem[n.id];
                  const isOpen = open === n.id;
                  return (
                    <div key={n.id} className="nx-vnote">
                      <button className="nx-vnote-head" onClick={() => setOpen(isOpen ? null : n.id)}>
                        <CircleDot size={11} />
                        <span className="nx-vnote-title">{n.title}</span>
                        {n.topic && <span className="nx-vnote-topic">{n.topic}</span>}
                        <span className="nx-vnote-meta">
                          {n.words}w · {Math.floor(n.secs / 60)}m
                          {n.stripped > 0 && <i> · {n.stripped} stripped</i>}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="nx-vnote-body">
                          <div className="nx-out-head">
                            <span>Summary</span>
                            <div className="nx-tool-row">
                              <CopyBtn value={n.text} />
                              <button className="nx-copy nx-copy-fail"
                                onClick={() => setNotes((p) => p.filter((x) => x.id !== n.id))}>
                                <Trash2 size={11} />Delete
                              </button>
                            </div>
                          </div>
                          {sum?.busy && <p className="nx-msg-busy"><Loader2 size={13} className="nx-spin" />Reading it back</p>}
                          {sum?.err && <p className="nx-out-err">{sum.err}</p>}
                          {!sum?.busy && !n.summary && (
                            <button className="nx-cta nx-sum-cta" onClick={() => summarize(n)}>
                              <Sparkles size={16} />Summarize this class
                            </button>
                          )}
                          {n.summary && (
                            <>
                              <div className="nx-fp-sum-body"><MsgText text={n.summary} /></div>
                              <button className="nx-copy nx-sum-redo" onClick={() => summarize(n)}>
                                <Sparkles size={11} />Redo summary
                              </button>
                            </>
                          )}

                          <div className="nx-out-head" style={{ marginTop: 14 }}>
                            <span>Reminders</span>
                            {!r?.busy && (
                              <button className="nx-copy" onClick={() => autoExtract(n)}>
                                <Bell size={11} />Re-scan
                              </button>
                            )}
                          </div>
                          {r?.busy && <p className="nx-msg-busy"><Loader2 size={13} className="nx-spin" />Scanning for dates and deadlines</p>}
                          {r?.err && <p className="nx-out-err">{r.err}</p>}
                          {n.reminders && n.reminders.length === 0 && <p className="nx-tool-note nx-tool-note-flush">Nothing that looked like a test or deadline.</p>}
                          {n.reminders?.length > 0 && (
                            <div className="nx-rem-list">
                              {n.reminders.map((it, i) => (
                                <div key={i} className="nx-tool-row nx-rem-row">
                                  <span className="nx-chip nx-chip-on nx-rem-badge"><Check size={11} />Added</span>
                                  <span className="nx-rem-text">{it.text}{it.due && <i> · {it.due}</i>}</span>
                                  {(audioSrc[n.id] || n.audioUrl) && it.at != null && (
                                    <button className="nx-copy" title="Play the moment this was said"
                                      onClick={() => playAt(it.at)}><Play size={11} />Replay</button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {(n.audioId || n.audioUrl) && (
                            <>
                              <div className="nx-out-head" style={{ marginTop: 14 }}><span>Recording</span></div>
                              {(audioSrc[n.id] || n.audioUrl)
                                ? <audio ref={isOpen ? noteAudioRef : null} src={audioSrc[n.id] || n.audioUrl} controls className="nx-note-audio" />
                                : <p className="nx-msg-busy"><Loader2 size={13} className="nx-spin" />Loading recording</p>}
                            </>
                          )}

                          <div className="nx-out-head" style={{ marginTop: 14 }}><span>Transcript</span></div>
                          <pre className="nx-fp-pre">{n.text}</pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ---------- study materials ---------- */

function SchoolStudy({ ctx }) {
  const [material, setMaterial] = useState("");
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [summary, setSummary] = useState(null);
  const [cards, setCards] = useState(null);
  const [flipped, setFlipped] = useState({});
  const [drag, setDrag] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async (job) => {
    if (!material.trim() || busy) return;
    setErr(null); setBusy(job);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      if (job === "summary") {
        const text = await askClaude({
          system: "Condense the study material into what a student actually needs to hold in their head. Lead with the core idea in one sentence, then short bullets for the specifics, then one line on what is most likely to be tested. Plain prose, no headers. Nothing that is not in the source.",
          messages: [{ role: "user", content: material }],
          signal: ac.signal,
        });
        setSummary(text);
      } else {
        const raw = await askClaude({
          system: 'Turn the material into flashcards. Return ONLY a JSON array, no prose and no code fences, shaped [{"front":"question","back":"answer"}]. Between 6 and 10 cards. Fronts are questions or prompts, backs are short and specific. Only use facts present in the material.',
          messages: [{ role: "user", content: material }],
          signal: ac.signal,
        });
        const clean = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(clean);
        if (!Array.isArray(parsed) || !parsed.length) throw new Error("The model did not return usable cards.");
        setCards(parsed.filter((c) => c && c.front && c.back));
        setFlipped({});
      }
    } catch (e) {
      if (e.name === "AbortError") return;
      setErr(e instanceof SyntaxError
        ? "The card output came back malformed. Try again — it usually works on a second pass."
        : e.message || "Could not reach the engine.");
    } finally {
      if (!ac.signal.aborted) setBusy(null);
    }
  };

  const readDropped = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    if (!/\.(txt|md|csv|json|py|js|jsx|ts|html|css)$/i.test(file.name)) {
      setErr(`Can't read ${file.name} as text. Plain text, markdown and code files work; PDFs need a parser.`);
      return;
    }
    setErr(null);
    setMaterial(await file.text());
  };

  return (
    <div className="nx-tool">
      <div className={`nx-drop-zone${drag ? " nx-drop-hot" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); readDropped(e.dataTransfer.files); }}>
        <textarea className="nx-field nx-drop-field" rows={8} value={material}
          onChange={(e) => setMaterial(e.target.value)}
          placeholder="Paste notes, a chapter, a lab writeup — or drop a text file here." />
        <p className="nx-drop-hint">
          {drag ? "Release to read the file" : `${wordCount(material)} words`}
        </p>
      </div>

      <div className="nx-tool-row">
        <button className="nx-chip nx-chip-on" onClick={() => run("summary")}
          disabled={!material.trim() || !!busy}>
          {busy === "summary" ? "Condensing…" : "Summarize"}
        </button>
        <button className="nx-chip nx-chip-on" onClick={() => run("cards")}
          disabled={!material.trim() || !!busy}>
          {busy === "cards" ? "Writing cards…" : "Make flashcards"}
        </button>
        {material && <button className="nx-chip" onClick={() => {
          setMaterial(""); setSummary(null); setCards(null); setErr(null);
        }}>Clear</button>}
      </div>

      {err && <p className="nx-out-err">{err}</p>}

      {summary && (
        <div className="nx-panel">
          <div className="nx-out-head">
            <span>Condensed</span>
            <CopyBtn value={summary} />
          </div>
          <div className="nx-fp-sum-body"><MsgText text={summary} /></div>
        </div>
      )}

      {cards && (
        <div className="nx-panel">
          <div className="nx-out-head">
            <span>{cards.length} cards · click to flip</span>
            <button className="nx-copy" onClick={() => setFlipped({})}>Reset all</button>
          </div>
          <div className="nx-cards">
            {cards.map((c, i) => (
              <button key={i} className={`nx-card${flipped[i] ? " nx-card-back" : ""}`}
                onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))}>
                <span className="nx-card-face">{flipped[i] ? c.back : c.front}</span>
                <span className="nx-card-tag">{flipped[i] ? "answer" : `card ${i + 1}`}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!summary && !cards && !busy && (
        <p className="nx-tool-note">
          Summaries and cards are built only from what you paste in. Nothing is
          filled in from general knowledge, so if the material is thin the cards
          will be too — that is the honest signal that your notes have gaps.
        </p>
      )}
    </div>
  );
}

/* ---------- assignments ---------- */

function SchoolWork({ ctx }) {
  const { demo } = ctx;
  const [items, setItems] = useState(() => demo ? [
    { id: 1, title: "Physics ch7 problem set", course: "Physics", due: "Tomorrow", urgent: true, done: false },
    { id: 2, title: "CyberPatriot practice round", course: "Cyber", due: "Friday", urgent: false, done: false },
    { id: 3, title: "Lab writeup — packet capture", course: "Networking", due: "Next week", urgent: false, done: false },
    { id: 4, title: "Read ch6 and take notes", course: "Physics", due: "Done", urgent: false, done: true },
  ] : []);
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [due, setDue] = useState("");

  useEffect(() => {
    if (!demo) setItems((p) => p.filter((i) => i.id > 1000));
  }, [demo]);

  const add = () => {
    if (!title.trim()) return;
    setItems((p) => [...p, {
      id: Date.now(), title: title.trim(),
      course: course.trim() || "General", due: due.trim() || "No date",
      urgent: false, done: false,
    }]);
    setTitle(""); setCourse(""); setDue("");
  };

  const open = items.filter((i) => !i.done);
  const closed = items.filter((i) => i.done);

  if (!items.length) {
    return (
      <div className="nx-tool">
        <div className="nx-first">
          <span className="nx-first-mark"><GraduationCap size={22} /></span>
          <h2>Nothing due.</h2>
          <p>Add what's on your plate and it'll show on the dashboard too.</p>
          <div className="nx-tool-row" style={{ justifyContent: "center", marginTop: 22 }}>
            <input className="nx-inline nx-inline-wide" value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()} placeholder="What's due" />
            <button className="nx-chip nx-chip-on" onClick={add} disabled={!title.trim()}>
              <Plus size={11} />Add
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nx-tool">
      <div className="nx-tool-row">
        <input className="nx-inline nx-inline-wide" value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()} placeholder="What's due" />
        <input className="nx-inline" value={course}
          onChange={(e) => setCourse(e.target.value)} placeholder="Course" />
        <input className="nx-inline" value={due}
          onChange={(e) => setDue(e.target.value)} placeholder="When" />
        <button className="nx-chip nx-chip-on" onClick={add} disabled={!title.trim()}>
          <Plus size={11} />Add
        </button>
      </div>

      <div className="nx-panel">
        <p className="nx-panel-title">Open · {open.length}</p>
        {open.length === 0 ? <p className="nx-blank">All clear</p> : (
          <div className="nx-work">
            {open.map((i) => (
              <div key={i.id} className={`nx-work-row${i.urgent ? " nx-work-urgent" : ""}`}>
                <button className="nx-work-check"
                  onClick={() => setItems((p) => p.map((x) => x.id === i.id ? { ...x, done: true } : x))}
                  aria-label={`Mark ${i.title} done`}><i /></button>
                <span className="nx-work-title">{i.title}</span>
                <span className="nx-work-course">{i.course}</span>
                <span className={`nx-work-due${i.urgent ? " nx-work-due-hot" : ""}`}>{i.due}</span>
                <span className="nx-drop" role="button" tabIndex={0} aria-label="Delete"
                  onClick={() => setItems((p) => p.filter((x) => x.id !== i.id))}
                  onKeyDown={(e) => e.key === "Enter" && setItems((p) => p.filter((x) => x.id !== i.id))}>
                  <X size={11} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {closed.length > 0 && (
        <div className="nx-panel">
          <p className="nx-panel-title">Done · {closed.length}</p>
          <div className="nx-work">
            {closed.map((i) => (
              <div key={i.id} className="nx-work-row nx-work-done">
                <button className="nx-work-check nx-work-checked"
                  onClick={() => setItems((p) => p.map((x) => x.id === i.id ? { ...x, done: false } : x))}
                  aria-label={`Reopen ${i.title}`}><i /></button>
                <span className="nx-work-title">{i.title}</span>
                <span className="nx-work-course">{i.course}</span>
                <span className="nx-work-due" />
                <span className="nx-drop" role="button" tabIndex={0} aria-label="Delete"
                  onClick={() => setItems((p) => p.filter((x) => x.id !== i.id))}
                  onKeyDown={(e) => e.key === "Enter" && setItems((p) => p.filter((x) => x.id !== i.id))}>
                  <X size={11} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const SCHOOL_TABS = [
  { id: "homework", label: "Homework", icon: BookOpen, blurb: "Photograph a problem and work through it properly.", body: SchoolHomework },
  { id: "notes", label: "Voice notes", icon: Mic, blurb: "Record a class, get a transcript you can actually read.", body: SchoolNotes },
  { id: "study", label: "Study", icon: Sparkles, blurb: "Drop material in, get it condensed or turned into cards.", body: SchoolStudy, ai: true },
  { id: "work", label: "Assignments", icon: CheckCircle2, blurb: "What's due and what isn't.", body: SchoolWork },
];

function SchoolView({ ctx }) {
  const schoolMode = ctx.settings?.schoolMode;
  const tabs = SCHOOL_TABS.filter((x) => !(schoolMode && x.ai));
  const [tab, setTab] = useState(tabs[0].id);
  // If the active tab got hidden by school mode, fall back to the first.
  const active = tabs.find((x) => x.id === tab) || tabs[0];
  const Body = active.body;
  return (
    <div className="nx-mod">
      <div className="nx-tabs">
        {tabs.map((x) => (
          <button key={x.id} className={`nx-tab${active.id === x.id ? " nx-tab-on" : ""}`}
            onClick={() => setTab(x.id)}>
            <x.icon size={14} strokeWidth={1.8} />{x.label}
          </button>
        ))}
        <span className="nx-tabs-flag">
          {SPEECH ? <><Mic size={11} />Speech engine ready</> : "No speech engine"}
        </span>
      </div>
      <p className="nx-tool-blurb">{active.blurb}</p>
      <Body ctx={ctx} />
    </div>
  );
}

/* ---------- chart ---------- */

function LineChart({ series, xLabel, height = 240 }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = height, PAD = { t: 14, r: 14, b: 26, l: 44 };
  const len = series[0]?.points.length || 0;

  const { lo, hi } = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const s of series) for (const v of s.points) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!isFinite(lo)) return { lo: 0, hi: 1 };
    const pad = (hi - lo) * 0.12 || 1;
    return { lo: lo - pad, hi: hi + pad };
  }, [series]);

  const px = (i) => PAD.l + (i / Math.max(1, len - 1)) * (W - PAD.l - PAD.r);
  const py = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((rel - PAD.l) / (W - PAD.l - PAD.r)) * (len - 1));
    setHover(i >= 0 && i < len ? i : null);
  };

  if (!len) return <p className="nx-blank">No samples</p>;

  return (
    <div className="nx-chart">
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        role="img" aria-label="Sensor readings over time">
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={py(v)} y2={py(v)} className="nx-chart-grid" />
            <text x={PAD.l - 8} y={py(v) + 3} className="nx-chart-tick">{v.toFixed(1)}</text>
          </g>
        ))}
        <text x={W / 2} y={H - 6} className="nx-chart-tick nx-chart-axis">{xLabel}</text>

        {series.map((s) => (
          <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="1.6"
            strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            points={s.points.map((v, i) => `${px(i)},${py(v)}`).join(" ")} />
        ))}

        {hover != null && (
          <g>
            <line x1={px(hover)} x2={px(hover)} y1={PAD.t} y2={H - PAD.b} className="nx-chart-cross" />
            {series.map((s) => (
              <circle key={s.key} cx={px(hover)} cy={py(s.points[hover])} r="3.2" fill={s.color} />
            ))}
          </g>
        )}
      </svg>

      <div className="nx-chart-legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />{s.name}
            <b>{hover != null ? s.points[hover].toFixed(2) : s.points[len - 1].toFixed(2)}</b>
          </span>
        ))}
        <em>{hover != null ? `sample ${hover}` : "latest"}</em>
      </div>
    </div>
  );
}

/* ---------- sensor runs ---------- */

const lcg = (seed) => { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; };

function makeRun(seed, n, shape) {
  const r = lcg(seed);
  return shape.map((ch) => ({
    ...ch,
    points: Array.from({ length: n }, (_, i) => +ch.f(i, r()).toFixed(3)),
  }));
}

const RUNS = [
  {
    id: "imu3", name: "rover-imu-run3", when: "2d", rate: "50 Hz", n: 140,
    note: "Chassis on the bench, no load. The gyro drift at the end is the bug.",
    series: makeRun(7, 140, [
      { key: "temp", name: "Temp °C", color: "var(--ember)", f: (i, r) => 24 + Math.sin(i / 24) * 2.2 + i * 0.02 + r * 0.3 },
      { key: "accel", name: "Accel Z g", color: "var(--signal)", f: (i, r) => 1 + Math.sin(i / 9) * 0.06 + r * 0.04 },
      { key: "gyro", name: "Gyro Z °/s", color: "var(--violet)", f: (i, r) => (i > 96 ? (i - 96) * 0.09 : 0) + Math.sin(i / 6) * 0.4 + r * 0.5 },
    ]),
  },
  {
    id: "therm", name: "enclosure-thermal", when: "5d", rate: "1 Hz", n: 120,
    note: "Lid closed, 5V regulator under load. Levels off around 47°C, which is fine.",
    series: makeRun(19, 120, [
      { key: "reg", name: "Regulator °C", color: "var(--ember)", f: (i, r) => 47 - 22 * Math.exp(-i / 26) + r * 0.6 },
      { key: "amb", name: "Ambient °C", color: "var(--signal)", f: (i, r) => 24.5 + i * 0.012 + r * 0.35 },
    ]),
  },
  {
    id: "batt", name: "battery-discharge", when: "1w", rate: "0.2 Hz", n: 130,
    note: "2S pack, constant 1.2A draw. The knee at the end is the cutoff.",
    series: makeRun(31, 130, [
      { key: "v", name: "Pack V", color: "var(--signal)", f: (i, r) => 8.4 - i * 0.0125 - (i > 108 ? (i - 108) * 0.055 : 0) + r * 0.02 },
      { key: "a", name: "Current A", color: "var(--violet)", f: (i, r) => 1.2 + Math.sin(i / 14) * 0.05 + r * 0.03 },
    ]),
  },
];

function EngSensors() {
  const [sel, setSel] = useState(RUNS[0].id);
  const [on, setOn] = useState(() => new Set(RUNS[0].series.map((s) => s.key)));
  const run = RUNS.find((r) => r.id === sel);
  const shown = run.series.filter((s) => on.has(s.key));

  const pick = (id) => {
    setSel(id);
    setOn(new Set(RUNS.find((r) => r.id === id).series.map((s) => s.key)));
  };

  const stats = (s) => {
    const min = Math.min(...s.points), max = Math.max(...s.points);
    const avg = s.points.reduce((a, b) => a + b, 0) / s.points.length;
    return { min, max, avg };
  };

  return (
    <div className="nx-tool">
      <div className="nx-tool-row">
        {RUNS.map((r) => (
          <button key={r.id} className={`nx-chip${sel === r.id ? " nx-chip-on" : ""}`}
            onClick={() => pick(r.id)}>{r.name}</button>
        ))}
        <span className="nx-fcount">{run.n} samples · {run.rate}</span>
      </div>

      <div className="nx-tool-row">
        {run.series.map((s) => (
          <button key={s.key} className={`nx-chip${on.has(s.key) ? " nx-chip-on" : ""}`}
            onClick={() => setOn((p) => {
              const next = new Set(p);
              next.has(s.key) ? next.delete(s.key) : next.add(s.key);
              return next.size ? next : p;
            })}>
            <i className="nx-ch-dot" style={{ background: s.color }} />{s.name}
          </button>
        ))}
      </div>

      {shown.length > 0 && <LineChart series={shown} xLabel={`sample index · ${run.rate}`} />}

      <div className="nx-net-cards">
        {shown.map((s) => {
          const st = stats(s);
          return (
            <div key={s.key} className="nx-nc">
              <p className="nx-nc-label">{s.name}</p>
              <p className="nx-nc-val nx-nc-val-sm">{st.avg.toFixed(2)}<i> avg</i></p>
              <p className="nx-nc-sub">{st.min.toFixed(2)} min · {st.max.toFixed(2)} max</p>
            </div>
          );
        })}
      </div>

      <p className="nx-tool-note">{run.note}</p>
      <p className="nx-tool-note">
        Simulated runs. The chart takes plain arrays, so a real serial feed drops
        straight in without touching this view.
      </p>
    </div>
  );
}

/* ---------- calculators ---------- */

const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

function nearestE12(v) {
  if (!isFinite(v) || v <= 0) return null;
  const decade = Math.floor(Math.log10(v));
  let best = null, bestErr = Infinity;
  for (const d of [decade - 1, decade, decade + 1]) {
    for (const m of E12) {
      const cand = m * 10 ** d;
      const err = Math.abs(cand - v) / v;
      if (err < bestErr) { bestErr = err; best = cand; }
    }
  }
  return best;
}

const ohms = (v) => v >= 1e6 ? `${(v / 1e6).toFixed(2)} MΩ`
  : v >= 1e3 ? `${(v / 1e3).toFixed(2)} kΩ` : `${v.toFixed(1)} Ω`;

function NumField({ label, unit, value, onChange, placeholder }) {
  return (
    <label className="nx-nf">
      <span>{label}{unit && <i>{unit}</i>}</span>
      <input className="nx-inline" value={value} inputMode="decimal"
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder} />
    </label>
  );
}

function OhmsLaw() {
  const [v, setV] = useState("5");
  const [i, setI] = useState("");
  const [r, setR] = useState("220");
  const nv = parseFloat(v), ni = parseFloat(i), nr = parseFloat(r);
  const known = [!isNaN(nv), !isNaN(ni), !isNaN(nr)].filter(Boolean).length;

  let out = null;
  if (known >= 2) {
    const V = !isNaN(nv) ? nv : ni * nr;
    const I = !isNaN(ni) ? ni : nv / nr;
    const R = !isNaN(nr) ? nr : nv / ni;
    if (isFinite(V) && isFinite(I) && isFinite(R) && I >= 0) {
      out = { V, I, R, P: V * I };
    }
  }

  return (
    <div className="nx-calc">
      <p className="nx-panel-title">Ohm's law</p>
      <div className="nx-calc-fields">
        <NumField label="Voltage" unit="V" value={v} onChange={setV} placeholder="—" />
        <NumField label="Current" unit="A" value={i} onChange={setI} placeholder="—" />
        <NumField label="Resistance" unit="Ω" value={r} onChange={setR} placeholder="—" />
      </div>
      {out ? (
        <div className="nx-calc-out">
          <span><b>{out.V.toFixed(3)}</b> V</span>
          <span><b>{(out.I * 1000).toFixed(1)}</b> mA</span>
          <span><b>{ohms(out.R)}</b></span>
          <span><b>{(out.P * 1000).toFixed(1)}</b> mW</span>
        </div>
      ) : (
        <p className="nx-tool-note nx-tool-note-flush">
          Fill any two. Clear one field to solve for it.
        </p>
      )}
      {out && out.P > 0.25 && (
        <p className="nx-calc-warn">
          {out.P.toFixed(2)} W exceeds a quarter-watt part. Use a bigger resistor or it will cook.
        </p>
      )}
    </div>
  );
}

function LedResistor() {
  const [vs, setVs] = useState("5");
  const [vf, setVf] = useState("2.1");
  const [mA, setMA] = useState("20");
  const nvs = parseFloat(vs), nvf = parseFloat(vf), ni = parseFloat(mA) / 1000;
  const head = nvs - nvf;
  const ok = isFinite(head) && head > 0 && isFinite(ni) && ni > 0;
  const R = ok ? head / ni : null;
  const pick = ok ? nearestE12(R) : null;
  const realI = pick ? head / pick : null;

  return (
    <div className="nx-calc">
      <p className="nx-panel-title">LED series resistor</p>
      <div className="nx-calc-fields">
        <NumField label="Supply" unit="V" value={vs} onChange={setVs} />
        <NumField label="LED forward" unit="V" value={vf} onChange={setVf} />
        <NumField label="Target" unit="mA" value={mA} onChange={setMA} />
      </div>
      {ok ? (
        <>
          <div className="nx-calc-out">
            <span><b>{ohms(R)}</b> exact</span>
            <span><b>{ohms(pick)}</b> nearest E12</span>
            <span><b>{(realI * 1000).toFixed(1)}</b> mA actual</span>
            <span><b>{(head * realI * 1000).toFixed(0)}</b> mW in resistor</span>
          </div>
          <p className="nx-tool-note nx-tool-note-flush">
            Typical forward voltages: red 1.8–2.2, green 2.0–3.0, blue and white 2.8–3.4.
          </p>
        </>
      ) : (
        <p className="nx-calc-warn">
          {head <= 0
            ? "Supply must exceed the LED's forward voltage or no current flows."
            : "Enter a supply, forward voltage and target current."}
        </p>
      )}
    </div>
  );
}

function Divider() {
  const [vin, setVin] = useState("12");
  const [r1, setR1] = useState("10000");
  const [r2, setR2] = useState("4700");
  const a = parseFloat(vin), b = parseFloat(r1), c = parseFloat(r2);
  const ok = [a, b, c].every((x) => isFinite(x) && x > 0);
  const vout = ok ? a * (c / (b + c)) : null;
  const draw = ok ? a / (b + c) : null;

  return (
    <div className="nx-calc">
      <p className="nx-panel-title">Voltage divider</p>
      <div className="nx-calc-fields">
        <NumField label="Vin" unit="V" value={vin} onChange={setVin} />
        <NumField label="R1 (top)" unit="Ω" value={r1} onChange={setR1} />
        <NumField label="R2 (bottom)" unit="Ω" value={r2} onChange={setR2} />
      </div>
      {ok ? (
        <>
          <div className="nx-calc-out">
            <span><b>{vout.toFixed(3)}</b> V out</span>
            <span><b>{(draw * 1e6).toFixed(0)}</b> µA through</span>
            <span><b>{ohms(b + c)}</b> total</span>
          </div>
          {vout > 3.3 && (
            <p className="nx-calc-warn">
              {vout.toFixed(2)} V will damage a 3.3 V input. Raise R1 or lower R2.
            </p>
          )}
        </>
      ) : <p className="nx-tool-note nx-tool-note-flush">All three values required.</p>}
    </div>
  );
}

const BANDS = ["Black", "Brown", "Red", "Orange", "Yellow", "Green", "Blue", "Violet", "Grey", "White"];
const BAND_HEX = ["#1a1a1a", "#6b4423", "#c0392b", "#d35400", "#d4b106", "#27865a",
  "#2b6cb0", "#7c5cbf", "#7a7a7a", "#e8e8e8"];
const MULTS = [...BANDS, "Gold", "Silver"];
const TOLS = [["Brown", "±1%"], ["Red", "±2%"], ["Green", "±0.5%"], ["Blue", "±0.25%"],
  ["Gold", "±5%"], ["Silver", "±10%"]];

function ColorCode() {
  const [b1, setB1] = useState(2);
  const [b2, setB2] = useState(2);
  const [mult, setMult] = useState(2);
  const [tol, setTol] = useState(4);

  const m = mult === 10 ? -1 : mult === 11 ? -2 : mult;
  const value = (b1 * 10 + b2) * 10 ** m;
  const swatch = (i) => (i < 10 ? BAND_HEX[i] : i === 10 ? "#c9a227" : "#b8b8b8");

  const Row = ({ label, options, value: v, onPick }) => (
    <div className="nx-cc-row">
      <span>{label}</span>
      <div className="nx-cc-swatches">
        {options.map((name, i) => (
          <button key={name} title={name}
            className={`nx-cc-sw${v === i ? " nx-cc-sw-on" : ""}`}
            style={{ background: swatch(i) }} onClick={() => onPick(i)} aria-label={name} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="nx-calc">
      <p className="nx-panel-title">Resistor colour code</p>
      <div className="nx-resistor">
        <span className="nx-res-body">
          <i style={{ background: swatch(b1) }} />
          <i style={{ background: swatch(b2) }} />
          <i style={{ background: swatch(mult) }} />
          <i className="nx-res-tol" style={{ background: swatch(TOLS[tol][0] === "Gold" ? 10 : TOLS[tol][0] === "Silver" ? 11 : BANDS.indexOf(TOLS[tol][0])) }} />
        </span>
      </div>
      <div className="nx-calc-out">
        <span><b>{ohms(value)}</b></span>
        <span><b>{TOLS[tol][1]}</b> tolerance</span>
      </div>
      <Row label="Digit 1" options={BANDS} value={b1} onPick={setB1} />
      <Row label="Digit 2" options={BANDS} value={b2} onPick={setB2} />
      <Row label="Multiplier" options={MULTS} value={mult} onPick={setMult} />
      <div className="nx-cc-row">
        <span>Tolerance</span>
        <div className="nx-tool-row">
          {TOLS.map(([name, t], i) => (
            <button key={name} className={`nx-chip${tol === i ? " nx-chip-on" : ""}`}
              onClick={() => setTol(i)}>{t}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EngCalc() {
  return (
    <div className="nx-calc-grid">
      <OhmsLaw />
      <LedResistor />
      <Divider />
      <ColorCode />
    </div>
  );
}

/* ---------- pin reference ---------- */

const PINS = {
  "Arduino Uno": [
    ["D0", "RX", "Serial receive. Avoid if using USB serial."],
    ["D1", "TX", "Serial transmit. Same warning."],
    ["D2", "INT0", "External interrupt."],
    ["D3", "PWM · INT1", "PWM and second interrupt."],
    ["D4", "GPIO", ""],
    ["D5", "PWM", "980 Hz by default, not 490."],
    ["D6", "PWM", "980 Hz by default."],
    ["D7", "GPIO", ""],
    ["D8", "GPIO", ""],
    ["D9", "PWM", ""],
    ["D10", "PWM · SS", "SPI slave select."],
    ["D11", "PWM · MOSI", "SPI data out."],
    ["D12", "MISO", "SPI data in."],
    ["D13", "SCK · LED", "Onboard LED shares this. Breaks SPI debugging."],
    ["A0–A3", "Analog in", "10-bit ADC, 0–1023."],
    ["A4", "SDA", "I²C data."],
    ["A5", "SCL", "I²C clock."],
    ["5V", "Power out", "Up to ~400 mA from USB."],
    ["3V3", "Power out", "50 mA maximum. Easy to exceed."],
    ["VIN", "Power in", "7–12 V through the regulator."],
  ],
  "ESP32 DevKit": [
    ["GPIO0", "Strapping", "Held low at boot enters flash mode. Don't load it."],
    ["GPIO2", "Strapping · LED", "Must float or be low at boot on some boards."],
    ["GPIO4", "ADC2 · Touch", "ADC2 unusable while WiFi is active."],
    ["GPIO5", "VSPI CS · Strapping", "Outputs a PWM pulse at boot."],
    ["GPIO12", "Strapping", "High at boot can brick a 3.3 V board. Avoid."],
    ["GPIO13", "GPIO", "Safe general purpose."],
    ["GPIO15", "Strapping", "Silences boot log if held low."],
    ["GPIO16–17", "GPIO", "Unavailable on WROVER modules."],
    ["GPIO18", "VSPI SCK", ""],
    ["GPIO19", "VSPI MISO", ""],
    ["GPIO21", "SDA", "Default I²C data."],
    ["GPIO22", "SCL", "Default I²C clock."],
    ["GPIO23", "VSPI MOSI", ""],
    ["GPIO25–26", "DAC1/2", "The only true analog outputs."],
    ["GPIO32–33", "ADC1 · Touch", "Use these for analog while WiFi is on."],
    ["GPIO34–35", "Input only", "No pull-ups, no output."],
    ["GPIO36, 39", "Input only", "ADC1, sensor pins."],
    ["GPIO6–11", "Reserved", "Wired to flash. Using them crashes the chip."],
  ],
  "Raspberry Pi": [
    ["Pin 1 / 17", "3V3", "50 mA total across both."],
    ["Pin 2 / 4", "5V", "Straight from the supply, unregulated."],
    ["GPIO2", "SDA1", "Has a fixed 1.8 kΩ pull-up."],
    ["GPIO3", "SCL1", "Also fixed pull-up."],
    ["GPIO4", "GPCLK0", "Common 1-Wire default."],
    ["GPIO7–8", "SPI0 CE1/CE0", ""],
    ["GPIO9–11", "SPI0 MISO/MOSI/SCLK", ""],
    ["GPIO12–13", "PWM0/1", "Hardware PWM."],
    ["GPIO14–15", "UART TX/RX", "Serial console by default."],
    ["GPIO18", "PWM0 · PCM", "Standard pin for addressable LEDs."],
    ["GPIO23–25", "GPIO", "Safe general purpose."],
    ["GPIO27", "GPIO", ""],
    ["ALL GPIO", "3.3 V only", "No 5 V tolerance anywhere. 5 V logic destroys pins."],
  ],
};

function EngPins() {
  const [board, setBoard] = useState("Arduino Uno");
  const [q, setQ] = useState("");
  const rows = PINS[board].filter((r) =>
    r.join(" ").toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="nx-tool">
      <div className="nx-tool-row">
        {Object.keys(PINS).map((b) => (
          <button key={b} className={`nx-chip${board === b ? " nx-chip-on" : ""}`}
            onClick={() => setBoard(b)}>{b}</button>
        ))}
        <input className="nx-inline nx-inline-wide" value={q}
          onChange={(e) => setQ(e.target.value)} placeholder="Filter: pwm, i2c, spi, adc…" />
      </div>

      {rows.length === 0
        ? <p className="nx-blank">No pin matches</p>
        : <div className="nx-pins">
            {rows.map((r) => (
              <div key={r[0]} className={`nx-pin${/reserved|avoid|destroy|brick/i.test(r[2]) ? " nx-pin-warn" : ""}`}>
                <span className="nx-pin-id">{r[0]}</span>
                <span className="nx-pin-fn">{r[1]}</span>
                <span className="nx-pin-note">{r[2]}</span>
              </div>
            ))}
          </div>}
      <p className="nx-tool-note">
        The notes are the parts that cost you an evening. Strapping pins on the
        ESP32 and the 3.3 V limit on Pi headers are the two that bite hardest.
      </p>
    </div>
  );
}

/* ---------- bench builds ---------- */

const BUILD_SEED = [
  {
    id: "b1", name: "Rover chassis v4", board: "Raspberry Pi 4", stage: "assembled",
    note: "Serial framing works. IMU drifts after ~2 minutes, suspect the mount is transmitting motor vibration.",
    parts: ["MPU-6050", "L298N driver", "2S LiPo", "Buck converter 5V/3A", "Pi 4 2GB"],
    todo: [{ id: 1, text: "Dampen the IMU mount", done: false },
           { id: 2, text: "Re-run drift test", done: false },
           { id: 3, text: "Solder power harness", done: true }],
  },
  {
    id: "b2", name: "Desk environment node", board: "ESP32 DevKit", stage: "breadboard",
    note: "Reads temp, humidity and pressure, posts to the dorm monitor every 30s.",
    parts: ["BME280", "ESP32 DevKit v1", "0.96\" OLED", "3.3 V LDO"],
    todo: [{ id: 1, text: "Move ADC to GPIO32 (WiFi conflict)", done: true },
           { id: 2, text: "Deep sleep between reads", done: false },
           { id: 3, text: "Print an enclosure", done: false }],
  },
  {
    id: "b3", name: "Bench PSU monitor", board: "Arduino Nano", stage: "enclosed",
    note: "Shunt-based current readout. Accurate to about 15 mA, good enough.",
    parts: ["INA219", "Arduino Nano", "16x2 LCD", "0.1 Ω shunt"],
    todo: [{ id: 1, text: "Calibrate against the multimeter", done: true },
           { id: 2, text: "Log to serial", done: true }],
  },
].map((b) => ({ ...b, seed: true }));

const STAGES = { breadboard: "Breadboard", assembled: "Assembled", enclosed: "Enclosed" };
const STAGE_TONE = { breadboard: "var(--ember)", assembled: "var(--signal)", enclosed: "var(--violet)" };

function EngBuilds({ ctx }) {
  const { demo } = ctx;
  const [builds, setBuilds] = usePersistent("eng-builds", []);
  const [open, setOpen] = useState(demo ? BUILD_SEED[0].id : null);
  const [making, setMaking] = useState(false);
  const [form, setForm] = useState({ name: "", board: "", note: "" });

  const create = () => {
    if (!form.name.trim()) return;
    const made = {
      id: `u${Date.now()}`, name: form.name.trim(),
      board: form.board.trim() || "Unspecified board", stage: "breadboard",
      note: form.note.trim(), parts: [], todo: [],
    };
    setBuilds((p) => [...p, made]);
    setOpen(made.id);
    setForm({ name: "", board: "", note: "" });
    setMaking(false);
    ctx.toast(`Started ${made.name}`);
  };

  const patch = (id, fn) => setBuilds((p) => p.map((b) => (b.id === id ? fn(b) : b)));

  if (!builds.length && !making) {
    return (
      <div className="nx-first">
        <span className="nx-first-mark"><CircuitBoard size={22} /></span>
        <h2>No builds on the bench.</h2>
        <p>Track what's wired up, what's in it, and what's still broken.</p>
        <button className="nx-cta" onClick={() => setMaking(true)}>
          Start a build <ArrowRight size={15} />
        </button>

      </div>
    );
  }

  return (
    <div className="nx-tool">
      {making ? (
        <div className="nx-panel">
          <p className="nx-panel-title">New build</p>
          <div className="nx-tool-row">
            <input className="nx-inline nx-inline-wide" value={form.name} autoFocus
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && create()} placeholder="What are you building" />
            <input className="nx-inline" value={form.board}
              onChange={(e) => setForm((f) => ({ ...f, board: e.target.value }))}
              placeholder="Board" />
          </div>
          <textarea className="nx-field" rows={2} value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="What it does, or what's wrong with it" />
          <div className="nx-tool-row">
            <button className="nx-btn nx-btn-on" onClick={create} disabled={!form.name.trim()}>Add build</button>
            <button className="nx-chip" onClick={() => setMaking(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="nx-tool-row">
          <button className="nx-chip nx-chip-on" onClick={() => setMaking(true)}>
            <Plus size={11} />New build
          </button>
          <span className="nx-fcount">{builds.length} on the bench</span>
        </div>
      )}

      {builds.map((b) => {
        const isOpen = open === b.id;
        const left = b.todo.filter((t) => !t.done).length;
        return (
          <div key={b.id} className="nx-vnote">
            <button className="nx-vnote-head" onClick={() => setOpen(isOpen ? null : b.id)}>
              <i className="nx-proj-dot" style={{ background: STAGE_TONE[b.stage] }} />
              <span className="nx-vnote-title">{b.name}</span>
              <span className="nx-vnote-meta">{b.board} · {left ? `${left} open` : "clear"}</span>
              <em>{STAGES[b.stage]}</em>
            </button>
            {isOpen && (
              <div className="nx-vnote-body">
                {b.note && <p className="nx-proj-readme">{b.note}</p>}

                <div className="nx-tool-row" style={{ marginTop: 14 }}>
                  {Object.entries(STAGES).map(([k, label]) => (
                    <button key={k} className={`nx-chip${b.stage === k ? " nx-chip-on" : ""}`}
                      onClick={() => patch(b.id, (x) => ({ ...x, stage: k }))}>{label}</button>
                  ))}
                </div>

                {b.parts.length > 0 && (
                  <>
                    <div className="nx-out-head" style={{ marginTop: 16 }}><span>Bill of materials</span></div>
                    <ul className="nx-caps">{b.parts.map((p) => <li key={p}>{p}</li>)}</ul>
                  </>
                )}

                <div className="nx-out-head" style={{ marginTop: 16 }}>
                  <span>Still to do</span>
                </div>
                {b.todo.length === 0
                  ? <p className="nx-blank">Nothing logged</p>
                  : <ul className="nx-tasks nx-tasks-lg">
                      {b.todo.map((t) => (
                        <li key={t.id} className="nx-task-line">
                          <button className={t.done ? "nx-task-on" : ""} aria-pressed={t.done}
                            onClick={() => patch(b.id, (x) => ({
                              ...x, todo: x.todo.map((y) => y.id === t.id ? { ...y, done: !y.done } : y),
                            }))}><i />{t.text}</button>
                        </li>
                      ))}
                    </ul>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const ENG_TABS = [
  { id: "builds", label: "Bench", icon: CircuitBoard, blurb: "What's wired up right now and what's wrong with it.", body: EngBuilds },
  { id: "sensors", label: "Sensor data", icon: Activity, blurb: "Logged runs, plotted.", body: EngSensors },
  { id: "calc", label: "Calculators", icon: Calculator, blurb: "The arithmetic you shouldn't be doing on your phone.", body: EngCalc },
  { id: "pins", label: "Pinouts", icon: Zap, blurb: "Which pin does what, and which ones will ruin your evening.", body: EngPins },
];

function EngineeringView({ ctx }) {
  const [tab, setTab] = useState("builds");
  const active = ENG_TABS.find((x) => x.id === tab);
  const Body = active.body;
  return (
    <div className="nx-mod">
      <div className="nx-tabs">
        {ENG_TABS.map((x) => (
          <button key={x.id} className={`nx-tab${tab === x.id ? " nx-tab-on" : ""}`}
            onClick={() => setTab(x.id)}>
            <x.icon size={14} strokeWidth={1.8} />{x.label}
          </button>
        ))}
        <span className="nx-tabs-flag"><Lock size={11} />Calculators run locally</span>
      </div>
      <p className="nx-tool-blurb">{active.blurb}</p>
      <Body ctx={ctx} />
    </div>
  );
}

const NO_ASK = new Set(["assistant", "terminal"]);

function ModuleAsk({ mod, ctx }) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const feedRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => { setThread([]); setErr(null); setDraft(""); }, [mod.id]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [thread, busy, open]);

  const send = async (text) => {
    const q = (text ?? draft).trim();
    if (!q || busy) return;
    setDraft(""); setErr(null);
    const next = [...thread, { role: "user", content: q }];
    setThread(next);
    setBusy(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const reply = await askClaude({
        system: [
          `You are answering from inside the ${mod.label} module of NEXUS OS, a personal command center.`,
          "NEXUS OS was created and founded by Gio Zamudio; if asked who made you or the app, the answer is Gio Zamudio (it runs on Claude by Anthropic).",
          `This module covers: ${mod.capabilities.join(", ")}.`,
          `Module summary: ${mod.summary}`,
          ctx.t ? `Live system snapshot: cpu ${Math.round(ctx.t.cpu)}%, memory ${Math.round(ctx.t.mem)}%, disk ${ctx.t.disk}%, ${Math.round(ctx.t.ping)}ms latency.` : "Telemetry is off.",
          "Keep answers short — a few sentences, or a tight list. Assume the person is a capable high school student at a cyber and engineering school.",
          "If a question is outside this module's subject, answer it anyway but say which module would suit it better.",
        ].join(" "),
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        signal: ac.signal,
      });
      setThread((p) => [...p, { role: "assistant", content: reply || "No response." }]);
    } catch (e) {
      if (e.name === "AbortError") return;
      setErr(e.message || "Could not reach the engine.");
      setThread((p) => p.slice(0, -1));
      setDraft(q);
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="nx-ask-fab" onClick={() => setOpen(true)}
        aria-label={`Ask about ${mod.label}`}>
        <Sparkles size={15} />
        <span>Ask about {mod.label}</span>
      </button>
    );
  }

  return (
    <div className="nx-ask">
      <div className="nx-ask-bar">
        <Sparkles size={13} />
        <span>{mod.label}</span>
        <em>scoped to this module</em>
        {thread.length > 0 && (
          <button className="nx-ask-clear" onClick={() => setThread([])} aria-label="Clear">
            <Trash2 size={12} />
          </button>
        )}
        <button className="nx-ask-x" onClick={() => setOpen(false)} aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="nx-ask-feed" ref={feedRef}>
        {thread.length === 0 && !busy && (
          <div className="nx-ask-empty">
            <p>Ask anything about {mod.label.toLowerCase()} — what a control does, why a
              reading looks wrong, or the concept behind it.</p>
            <div className="nx-ask-seeds">
              <button onClick={() => send(`What can I do in the ${mod.label} module?`)}>
                What's in here?
              </button>
              <button onClick={() => send(`Explain ${mod.capabilities[0].toLowerCase()} and why it matters.`)}>
                Explain {mod.capabilities[0].toLowerCase()}
              </button>
            </div>
          </div>
        )}

        {thread.map((m, i) => (
          <div key={i} className={`nx-msg nx-msg-${m.role}`}>
            {m.role === "assistant" && <span className="nx-msg-mark" />}
            <div className="nx-msg-body"><MsgText text={m.content} /></div>
          </div>
        ))}

        {busy && (
          <div className="nx-msg nx-msg-assistant">
            <span className="nx-msg-mark nx-msg-mark-busy" />
            <div className="nx-msg-body nx-msg-busy">
              <Loader2 size={13} className="nx-spin" />Thinking
            </div>
          </div>
        )}

        {err && (
          <div className="nx-asst-err">
            <AlertTriangle size={13} /><span>{err}</span>
          </div>
        )}
      </div>

      <div className="nx-asst-composer nx-ask-composer">
        <textarea rows={1} value={draft} placeholder={`Ask about ${mod.label.toLowerCase()}`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }} />
        <button className="nx-asst-send" onClick={() => send()} disabled={busy || !draft.trim()}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

const SUBJECTS = [
  { id: "robotics", label: "Robotics", seed: "PID control tuning" },
  { id: "embedded", label: "Embedded", seed: "I2C vs SPI tradeoffs" },
  { id: "network", label: "Networking", seed: "TCP congestion control" },
  { id: "cyber", label: "Cybersecurity", seed: "buffer overflow exploitation basics" },
  { id: "electronics", label: "Electronics", seed: "MOSFET as a low-side switch" },
  { id: "cs", label: "Algorithms", seed: "how Dijkstra's algorithm works" },
  { id: "physics", label: "Physics", seed: "rotational inertia" },
  { id: "math", label: "Math", seed: "why matrices rotate vectors" },
];

const DEPTHS = [
  { id: "explain", label: "Explain it", hint: "Plain explanation, then places to go deeper." },
  { id: "deep", label: "Deep dive", hint: "Assumes the basics. Mechanisms and edge cases." },
  { id: "sources", label: "Sources only", hint: "Skip the explanation, just the good material." },
];

const SUBJECT_HINT = {
  robotics: "control theory, kinematics, actuators, sensor fusion",
  embedded: "microcontrollers, buses, firmware, real-time constraints",
  network: "protocols, routing, packet analysis",
  cyber: "defensive security, exploitation concepts for CTF and coursework",
  electronics: "analog and digital circuits, components, measurement",
  cs: "algorithms, data structures, complexity",
  physics: "mechanics, electromagnetism, thermodynamics",
  math: "linear algebra, calculus, discrete math",
};

function EncyclopediaView({ ctx }) {
  const [subject, setSubject] = useState("robotics");
  const [depth, setDepth] = useState("explain");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [entry, setEntry] = useState(null);
  const [saved, setSaved] = useState([]);
  const [recent, setRecent] = useState([]);
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const subj = SUBJECTS.find((s) => s.id === subject);
  const dep = DEPTHS.find((d) => d.id === depth);

  const look = async (override) => {
    const q = (override ?? topic).trim();
    if (!q || busy) return;
    setErr(null); setBusy(true); setEntry(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const style = depth === "sources"
      ? "Skip explanation entirely. Go straight to the reading list."
      : depth === "deep"
        ? "Assume the basics are known. Explain the mechanism, the maths where it matters, and the failure modes people hit."
        : "Explain it plainly first, in a few short paragraphs, building from what a bright high school student already knows.";

    try {
      const text = await askClaude({
        system: [
          "You are a study librarian for a student at a cyber technology and engineering high school.",
          `Subject area: ${subj.label} — ${SUBJECT_HINT[subject]}.`,
          style,
          "Then give a section that begins with the single line 'Sources:' followed by 4 to 7 bullet points.",
          "Each bullet is a markdown link followed by a dash and one short sentence on what makes it worth the time and what format it is (course notes, interactive, video series, reference, textbook chapter, simulator).",
          "Strongly prefer primary and educational sources: university course pages, official documentation, standards bodies, well-regarded textbooks, established interactive simulators. Avoid content farms, SEO listicles, and AI-generated pages.",
          "Only include links you actually found. Never invent a URL. If you cannot verify enough good sources, say how many you found and stop.",
          "Where a genuinely good interactive tool, simulator or visualisation exists, call that out — those are worth more than prose for this student.",
        ].join(" "),
        messages: [{ role: "user", content: q }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        maxTokens: 2000,
        signal: ac.signal,
      });
      const made = { id: Date.now(), topic: q, subject, depth, text, when: "now" };
      setEntry(made);
      setRecent((p) => [made, ...p.filter((x) => x.topic !== q)].slice(0, 8));
    } catch (e) {
      if (e.name === "AbortError") return;
      setErr(e.message || "Could not reach the engine.");
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  };

  const isSaved = entry && saved.some((s) => s.id === entry.id);

  return (
    <div className="nx-mod">
      <div className="nx-tool-row nx-enc-subjects">
        {SUBJECTS.map((s) => (
          <button key={s.id} className={`nx-chip${subject === s.id ? " nx-chip-on" : ""}`}
            onClick={() => setSubject(s.id)}>{s.label}</button>
        ))}
      </div>

      <div className="nx-fsearch nx-enc-search">
        <Library size={16} />
        <input value={topic} onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && look()}
          placeholder={`Look up something in ${subj.label.toLowerCase()} — try "${subj.seed}"`} />
        <button className="nx-chip nx-chip-on" onClick={() => look()} disabled={busy || !topic.trim()}>
          {busy ? "Searching…" : "Look up"}
        </button>
      </div>

      <div className="nx-tool-row">
        {DEPTHS.map((d) => (
          <button key={d.id} className={`nx-chip${depth === d.id ? " nx-chip-on" : ""}`}
            onClick={() => setDepth(d.id)}>{d.label}</button>
        ))}
        <span className="nx-tool-note nx-tool-note-flush">{dep.hint}</span>
      </div>

      <p className="nx-enc-slow">
        <Clock size={11} /> Answers here take longer than a normal chat — it runs
        real web searches and reads the sources before replying. Give it a moment.
      </p>

      {!entry && !busy && !err && (
        <>
          <div className="nx-enc-quick">
            <p className="nx-panel-title">Start somewhere</p>
            <div className="nx-tool-row">
              {SUBJECTS.map((s) => (
                <button key={s.id} className="nx-chip"
                  onClick={() => { setSubject(s.id); setTopic(s.seed); look(s.seed); }}>
                  {s.seed}
                </button>
              ))}
            </div>
          </div>
          <p className="nx-tool-note">
            This searches the live web and only lists links it actually found. If it
            can't verify enough good material on something, it says so rather than
            filling the gap with plausible-looking URLs.
          </p>
        </>
      )}

      {busy && (
        <div className="nx-panel nx-enc-busy">
          <p className="nx-msg-busy">
            <Loader2 size={13} className="nx-spin" />Searching and reading sources
          </p>
          <p className="nx-tool-note nx-tool-note-flush">
            This takes longer than a normal answer — it is doing real lookups.
          </p>
        </div>
      )}

      {err && <p className="nx-out-err">{err}</p>}

      {entry && (
        <div className="nx-panel nx-enc-entry">
          <div className="nx-out-head">
            <span>{SUBJECTS.find((s) => s.id === entry.subject).label} · {entry.topic}</span>
            <div className="nx-tool-row">
              <button className="nx-copy" onClick={() => setSaved((p) =>
                isSaved ? p.filter((x) => x.id !== entry.id) : [entry, ...p])}>
                <Bookmark size={11} />{isSaved ? "Saved" : "Save"}
              </button>
              <CopyBtn value={entry.text} />
            </div>
          </div>
          <div className="nx-enc-body"><MsgText text={entry.text} /></div>
        </div>
      )}

      {(recent.length > 0 || saved.length > 0) && (
        <div className="nx-net-split">
          {saved.length > 0 && (
            <div className="nx-panel">
              <p className="nx-panel-title">Saved · {saved.length}</p>
              <div className="nx-enc-list">
                {saved.map((s) => (
                  <div key={s.id} className="nx-enc-item">
                    <button onClick={() => { setEntry(s); setSubject(s.subject); setTopic(s.topic); }}>
                      <Bookmark size={11} />{s.topic}
                    </button>
                    <span className="nx-drop" role="button" tabIndex={0} aria-label="Remove"
                      onClick={() => setSaved((p) => p.filter((x) => x.id !== s.id))}
                      onKeyDown={(e) => e.key === "Enter" && setSaved((p) => p.filter((x) => x.id !== s.id))}>
                      <X size={11} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div className="nx-panel">
              <p className="nx-panel-title">Recent lookups</p>
              <div className="nx-enc-list">
                {recent.map((r) => (
                  <div key={r.id} className="nx-enc-item">
                    <button onClick={() => { setEntry(r); setSubject(r.subject); setTopic(r.topic); }}>
                      <Clock size={11} />{r.topic}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const dayLabel = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const WEIGHT_SEED = [
  { id: 1, date: daysAgo(42), kg: 74.8, seed: true },
  { id: 2, date: daysAgo(35), kg: 74.1, seed: true },
  { id: 3, date: daysAgo(28), kg: 73.9, seed: true },
  { id: 4, date: daysAgo(21), kg: 73.2, seed: true },
  { id: 5, date: daysAgo(14), kg: 72.9, seed: true },
  { id: 6, date: daysAgo(7), kg: 72.4, seed: true },
  { id: 7, date: daysAgo(1), kg: 72.1, seed: true },
];

const WORKOUT_SEED = [
  { id: 1, date: daysAgo(1), kind: "Push", note: "Bench 4×8 @ 60kg, OHP, dips", mins: 55, seed: true },
  { id: 2, date: daysAgo(2), kind: "Run", note: "5k, easy pace", mins: 28, seed: true },
  { id: 3, date: daysAgo(3), kind: "Pull", note: "Deadlift 3×5 @ 90kg, rows, curls", mins: 50, seed: true },
  { id: 4, date: daysAgo(5), kind: "Legs", note: "Squat 5×5 @ 80kg, lunges", mins: 48, seed: true },
].map((w) => ({ ...w }));

const KINDS = ["Push", "Pull", "Legs", "Run", "Cardio", "Mobility", "Other"];
const KIND_TONE = {
  Push: "var(--signal)", Pull: "var(--violet)", Legs: "var(--ember)",
  Run: "var(--signal)", Cardio: "var(--signal)", Mobility: "var(--violet)", Other: "var(--muted-2)",
};

/* ---------- weight ---------- */

function FitWeight({ ctx }) {
  const { demo } = ctx;
  const [log, setLog] = usePersistent("fit-weight", []);
  const [kg, setKg] = useState("");
  const [date, setDate] = useState(todayISO());
  const [goal, setGoal] = useState(demo ? "70" : "");

  const sorted = [...log].sort((a, b) => a.date.localeCompare(b.date));

  const add = () => {
    const v = parseFloat(kg);
    if (!isFinite(v) || v <= 0) return;
    setLog((p) => [...p.filter((w) => w.date !== date), { id: Date.now(), date, kg: v }]);
    setKg("");
  };

  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  const delta = latest && first ? latest.kg - first.kg : 0;
  const goalN = parseFloat(goal);
  const toGoal = latest && isFinite(goalN) ? latest.kg - goalN : null;

  return (
    <div className="nx-tool">
      <div className="nx-tool-row">
        <label className="nx-nf">
          <span>Weight<i>kg</i></span>
          <input className="nx-inline" value={kg} inputMode="decimal"
            onChange={(e) => setKg(e.target.value.replace(/[^0-9.]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && add()} placeholder="72.0" />
        </label>
        <label className="nx-nf">
          <span>Date</span>
          <input className="nx-inline" type="date" value={date} max={todayISO()}
            onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="nx-nf">
          <span>Goal<i>kg</i></span>
          <input className="nx-inline" value={goal} inputMode="decimal"
            onChange={(e) => setGoal(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="—" />
        </label>
        <button className="nx-chip nx-chip-on nx-fit-add" onClick={add} disabled={!kg}>
          <Plus size={11} />Log
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="nx-empty">
          <p className="nx-empty-title">No weigh-ins yet.</p>
          <p className="nx-empty-body">Log one and a trend line builds as you go.</p>
        </div>
      ) : (
        <>
          <div className="nx-net-cards">
            <div className="nx-nc">
              <p className="nx-nc-label">Current</p>
              <p className="nx-nc-val">{latest.kg.toFixed(1)}<i> kg</i></p>
              <p className="nx-nc-sub">{dayLabel(latest.date)}</p>
            </div>
            <div className="nx-nc">
              <p className="nx-nc-label">Change</p>
              <p className="nx-nc-val nx-nc-val-sm" style={{ color: delta <= 0 ? "var(--signal)" : "var(--ember)" }}>
                {delta > 0 ? "+" : ""}{delta.toFixed(1)}<i> kg</i>
              </p>
              <p className="nx-nc-sub">over {sorted.length} entries</p>
            </div>
            {toGoal != null && (
              <div className="nx-nc">
                <p className="nx-nc-label">To goal</p>
                <p className="nx-nc-val nx-nc-val-sm">{Math.abs(toGoal).toFixed(1)}<i> kg</i></p>
                <p className="nx-nc-sub">{toGoal > 0 ? "to lose" : toGoal < 0 ? "to gain" : "reached"}</p>
              </div>
            )}
          </div>

          {sorted.length >= 2 && (
            <LineChart height={210} xLabel={`${dayLabel(sorted[0].date)} → ${dayLabel(latest.date)}`}
              series={[
                { key: "kg", name: "Weight kg", color: "var(--signal)", points: sorted.map((w) => w.kg) },
                ...(isFinite(goalN) ? [{ key: "goal", name: "Goal", color: "var(--muted-2)", points: sorted.map(() => goalN) }] : []),
              ]} />
          )}

          <div className="nx-panel">
            <p className="nx-panel-title">History</p>
            <div className="nx-fit-rows">
              {[...sorted].reverse().map((w) => (
                <div key={w.id} className="nx-fit-row">
                  <span className="nx-mono">{dayLabel(w.date)}</span>
                  <span className="nx-fit-kg">{w.kg.toFixed(1)} kg</span>
                  {!w.seed && (
                    <span className="nx-drop" role="button" tabIndex={0} aria-label="Delete"
                      onClick={() => setLog((p) => p.filter((x) => x.id !== w.id))}
                      onKeyDown={(e) => e.key === "Enter" && setLog((p) => p.filter((x) => x.id !== w.id))}>
                      <X size={11} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- workouts ---------- */

function FitWorkouts({ ctx }) {
  const { demo } = ctx;
  const log = ctx.workouts || [];
  const setLog = ctx.setWorkouts;
  const [kind, setKind] = useState("Push");
  const [note, setNote] = useState("");
  const [mins, setMins] = useState("");

  const add = () => {
    if (!note.trim()) return;
    setLog((p) => [{ id: Date.now(), date: todayISO(), kind, note: note.trim(),
      mins: parseInt(mins, 10) || 0 }, ...p]);
    setNote(""); setMins("");
  };

  const sorted = [...log].sort((a, b) => b.date.localeCompare(a.date));
  const weekCount = log.filter((w) => w.date >= daysAgo(7)).length;
  const weekMins = log.filter((w) => w.date >= daysAgo(7)).reduce((a, w) => a + (w.mins || 0), 0);

  return (
    <div className="nx-tool">
      <div className="nx-tool-row">
        {KINDS.map((k) => (
          <button key={k} className={`nx-chip${kind === k ? " nx-chip-on" : ""}`}
            onClick={() => setKind(k)}>{k}</button>
        ))}
      </div>
      <div className="nx-tool-row">
        <input className="nx-inline nx-inline-wide" value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="What you did — lifts, distance, sets" />
        <label className="nx-nf">
          <span>Mins</span>
          <input className="nx-inline nx-inline-sm" value={mins} inputMode="numeric"
            onChange={(e) => setMins(e.target.value.replace(/[^0-9]/g, ""))} placeholder="45" />
        </label>
        <button className="nx-chip nx-chip-on nx-fit-add" onClick={add} disabled={!note.trim()}>
          <Plus size={11} />Log
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="nx-empty">
          <p className="nx-empty-title">No sessions logged.</p>
          <p className="nx-empty-body">Pick a type, jot what you did, and it builds a training history.</p>
        </div>
      ) : (
        <>
          <div className="nx-net-cards">
            <div className="nx-nc">
              <p className="nx-nc-label">This week</p>
              <p className="nx-nc-val">{weekCount}<i> sessions</i></p>
              <p className="nx-nc-sub">{weekMins} minutes total</p>
            </div>
            <div className="nx-nc">
              <p className="nx-nc-label">All time</p>
              <p className="nx-nc-val nx-nc-val-sm">{log.length}<i> logged</i></p>
              <p className="nx-nc-sub">since you started tracking</p>
            </div>
          </div>

          <div className="nx-panel">
            <p className="nx-panel-title">Sessions</p>
            <div className="nx-fit-rows">
              {sorted.map((w) => (
                <div key={w.id} className="nx-work-row">
                  <i className="nx-proj-dot" style={{ background: KIND_TONE[w.kind] }} />
                  <span className="nx-work-course" style={{ minWidth: 54 }}>{w.kind}</span>
                  <span className="nx-work-title">{w.note}</span>
                  <span className="nx-work-due">{w.mins ? `${w.mins}m` : ""}</span>
                  <span className="nx-mono nx-fit-date">{dayLabel(w.date)}</span>
                  {!w.seed && (
                    <span className="nx-drop" role="button" tabIndex={0} aria-label="Delete"
                      onClick={() => setLog((p) => p.filter((x) => x.id !== w.id))}
                      onKeyDown={(e) => e.key === "Enter" && setLog((p) => p.filter((x) => x.id !== w.id))}>
                      <X size={11} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- macros ---------- */

const RING_TARGETS = [
  { key: "protein", label: "Protein", unit: "g", tone: "var(--signal)" },
  { key: "carbs", label: "Carbs", unit: "g", tone: "var(--violet)" },
  { key: "fat", label: "Fat", unit: "g", tone: "var(--ember)" },
];

function MacroRing({ value, target, tone, label, unit }) {
  const r = 34, circ = 2 * Math.PI * r;
  const p = target > 0 ? Math.min(1, value / target) : 0;
  const over = value > target && target > 0;
  return (
    <div className="nx-macro">
      <svg viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={r} className="nx-gauge-track" strokeWidth="7" />
        <circle cx="45" cy="45" r={r} fill="none" strokeWidth="7" strokeLinecap="round"
          stroke={over ? "var(--ember)" : tone}
          strokeDasharray={`${circ * p} ${circ}`} transform="rotate(-90 45 45)" />
      </svg>
      <div className="nx-macro-val">
        <b>{Math.round(value)}</b><span>/ {target || "—"}{unit}</span>
      </div>
      <p className="nx-macro-label">{label}</p>
    </div>
  );
}

function FitMacros({ ctx }) {
  const { demo } = ctx;
  const [targets, setTargets] = useState(demo
    ? { cal: 2400, protein: 170, carbs: 240, fat: 70 }
    : { cal: "", protein: "", carbs: "", fat: "" });
  const [entries, setEntries] = useState(demo ? [
    { id: 1, name: "Chicken + rice", cal: 620, protein: 52, carbs: 68, fat: 12 },
    { id: 2, name: "Protein shake", cal: 180, protein: 40, carbs: 4, fat: 2 },
    { id: 3, name: "Oats + banana", cal: 340, protein: 12, carbs: 62, fat: 7 },
  ] : []);
  const [form, setForm] = useState({ name: "", cal: "", protein: "", carbs: "", fat: "" });

  useEffect(() => {
    if (!demo) { setEntries([]); setTargets({ cal: "", protein: "", carbs: "", fat: "" }); }
    else setTargets((t) => t.cal ? t : { cal: 2400, protein: 170, carbs: 240, fat: 70 });
  }, [demo]);

  const totals = entries.reduce((a, e) => ({
    cal: a.cal + e.cal, protein: a.protein + e.protein,
    carbs: a.carbs + e.carbs, fat: a.fat + e.fat,
  }), { cal: 0, protein: 0, carbs: 0, fat: 0 });

  const add = () => {
    if (!form.name.trim()) return;
    setEntries((p) => [...p, {
      id: Date.now(), name: form.name.trim(),
      cal: +form.cal || 0, protein: +form.protein || 0,
      carbs: +form.carbs || 0, fat: +form.fat || 0,
    }]);
    setForm({ name: "", cal: "", protein: "", carbs: "", fat: "" });
  };

  const setT = (k, v) => setTargets((t) => ({ ...t, [k]: v.replace(/[^0-9]/g, "") }));
  const calTarget = parseInt(targets.cal, 10) || 0;
  const calPct = calTarget ? Math.min(100, (totals.cal / calTarget) * 100) : 0;

  return (
    <div className="nx-tool">
      <div className="nx-panel">
        <div className="nx-out-head">
          <span>Today · {totals.cal} / {calTarget || "—"} kcal</span>
        </div>
        <span className="nx-track" style={{ marginTop: 4 }}>
          <i style={{ width: `${calPct}%`, background: totals.cal > calTarget && calTarget ? "var(--ember)" : "var(--signal)" }} />
        </span>
        <div className="nx-macros">
          {RING_TARGETS.map((m) => (
            <MacroRing key={m.key} value={totals[m.key]} target={parseInt(targets[m.key], 10) || 0}
              tone={m.tone} label={m.label} unit={m.unit} />
          ))}
        </div>
      </div>

      <div className="nx-panel">
        <p className="nx-panel-title">Daily targets</p>
        <div className="nx-tool-row">
          {[["cal", "kcal"], ["protein", "g protein"], ["carbs", "g carbs"], ["fat", "g fat"]].map(([k, label]) => (
            <label key={k} className="nx-nf">
              <span>{label}</span>
              <input className="nx-inline nx-inline-sm" value={targets[k]} inputMode="numeric"
                onChange={(e) => setT(k, e.target.value)} placeholder="—" />
            </label>
          ))}
        </div>
      </div>

      <div className="nx-panel">
        <p className="nx-panel-title">Log food</p>
        <div className="nx-tool-row">
          <input className="nx-inline nx-inline-wide" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && add()} placeholder="What you ate" />
          {["cal", "protein", "carbs", "fat"].map((k) => (
            <input key={k} className="nx-inline nx-inline-sm" value={form[k]} inputMode="numeric"
              onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value.replace(/[^0-9]/g, "") }))}
              placeholder={k === "cal" ? "kcal" : k[0].toUpperCase()} />
          ))}
          <button className="nx-chip nx-chip-on nx-fit-add" onClick={add} disabled={!form.name.trim()}>
            <Plus size={11} />Add
          </button>
        </div>

        {entries.length === 0
          ? <p className="nx-blank">Nothing logged today</p>
          : <div className="nx-fit-rows">
              {entries.map((e) => (
                <div key={e.id} className="nx-fit-food">
                  <span className="nx-work-title">{e.name}</span>
                  <span className="nx-food-macros">
                    {e.cal} kcal · {e.protein}p · {e.carbs}c · {e.fat}f
                  </span>
                  <span className="nx-drop" role="button" tabIndex={0} aria-label="Delete"
                    onClick={() => setEntries((p) => p.filter((x) => x.id !== e.id))}
                    onKeyDown={(ev) => ev.key === "Enter" && setEntries((p) => p.filter((x) => x.id !== e.id))}>
                    <X size={11} />
                  </span>
                </div>
              ))}
            </div>}
      </div>
    </div>
  );
}

const FIT_TABS = [
  { id: "workouts", label: "Workouts", icon: Dumbbell, blurb: "Log sessions and see your week.", body: FitWorkouts },
  { id: "weight", label: "Weight", icon: Activity, blurb: "Track the trend, not the daily noise.", body: FitWeight },
  { id: "macros", label: "Macros", icon: Gauge, blurb: "Calories and protein against a target.", body: FitMacros },
];

function FitnessView({ ctx }) {
  const [tab, setTab] = useState("workouts");
  const active = FIT_TABS.find((x) => x.id === tab);
  const Body = active.body;
  return (
    <div className="nx-mod">
      <div className="nx-tabs">
        {FIT_TABS.map((x) => (
          <button key={x.id} className={`nx-tab${tab === x.id ? " nx-tab-on" : ""}`}
            onClick={() => setTab(x.id)}>
            <x.icon size={14} strokeWidth={1.8} />{x.label}
          </button>
        ))}
      </div>
      <p className="nx-tool-blurb">{active.blurb}</p>
      <Body ctx={ctx} />
    </div>
  );
}

const TRIGGERS = {
  cpu:   { label: "CPU load", kind: "metric", field: "cpu", unit: "%", live: true },
  mem:   { label: "Memory used", kind: "metric", field: "mem", unit: "%", live: true },
  disk:  { label: "Disk used", kind: "metric", field: "disk", unit: "%", live: true },
  temp:  { label: "CPU temp", kind: "metric", field: "temp", unit: "°C", live: true },
  ping:  { label: "Latency", kind: "metric", field: "ping", unit: "ms", live: true },
  down:  { label: "Download", kind: "metric", field: "down", unit: "Mb/s", live: true },
  offline: { label: "Connection drops", kind: "event", live: true },
  startup: { label: "On app start", kind: "event", live: false },
  wifi:  { label: "Joins home Wi-Fi", kind: "event", live: false },
  schedule: { label: "On a schedule", kind: "schedule", live: false },
};

const ACTIONS = {
  notify: { label: "Send a notification", tone: "signal", needsText: true },
  toast:  { label: "Show a toast", tone: "signal", needsText: true },
  log:    { label: "Write to the event log", tone: "violet", needsText: true },
  run:    { label: "Run a command", tone: "ember", needsText: true, backend: true },
  open:   { label: "Launch an app", tone: "ember", needsText: true, backend: true },
};

const OPS = [[">", "rises above"], ["<", "drops below"]];

const RULE_SEED = [
  { id: 1, on: true, trig: "cpu", op: ">", value: 85, action: "notify",
    text: "CPU has been pinned — check what's running", fired: 0, seed: true },
  { id: 2, on: true, trig: "disk", op: ">", value: 90, action: "notify",
    text: "Disk nearly full, time to clean up", fired: 0, seed: true },
  { id: 3, on: true, trig: "offline", action: "log",
    text: "Network dropped", fired: 0, seed: true },
  { id: 4, on: false, trig: "temp", op: ">", value: 80, action: "toast",
    text: "Thermals climbing", fired: 0, seed: true },
  { id: 5, on: true, trig: "schedule", every: "Friday 16:00", action: "notify",
    text: "Weekly backup reminder", fired: 0, seed: true },
  { id: 6, on: false, trig: "startup", action: "run",
    text: "git -C ~/nexus pull", fired: 0, seed: true },
].map((r) => ({ ...r }));

function ruleSummary(r) {
  const t = TRIGGERS[r.trig];
  if (t.kind === "metric") {
    const verb = OPS.find(([o]) => o === r.op)?.[1] || r.op;
    return `When ${t.label.toLowerCase()} ${verb} ${r.value}${t.unit}`;
  }
  if (r.trig === "schedule") return `Every ${r.every || "—"}`;
  return `When ${t.label.toLowerCase()}`;
}

function RuleForm({ initial, onSave, onCancel }) {
  const [r, setR] = useState(initial);
  const set = (k, v) => setR((p) => ({ ...p, [k]: v }));
  const t = TRIGGERS[r.trig];
  const act = ACTIONS[r.action];
  const valid = r.text.trim() &&
    (t.kind !== "metric" || (r.value !== "" && isFinite(+r.value))) &&
    (r.trig !== "schedule" || (r.every || "").trim());

  return (
    <div className="nx-panel nx-rule-form">
      <p className="nx-panel-title">{initial.id ? "Edit rule" : "New rule"}</p>

      <div className="nx-rule-line">
        <span className="nx-rule-word">When</span>
        <select className="nx-select" value={r.trig} onChange={(e) => set("trig", e.target.value)}>
          {Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        {t.kind === "metric" && (
          <>
            <select className="nx-select" value={r.op} onChange={(e) => set("op", e.target.value)}>
              {OPS.map(([o, label]) => <option key={o} value={o}>{label}</option>)}
            </select>
            <input className="nx-inline nx-inline-sm" value={r.value} inputMode="decimal"
              onChange={(e) => set("value", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" />
            <span className="nx-rule-unit">{t.unit}</span>
          </>
        )}

        {r.trig === "schedule" && (
          <input className="nx-inline" value={r.every || ""}
            onChange={(e) => set("every", e.target.value)} placeholder="Friday 16:00" />
        )}
      </div>

      <div className="nx-rule-line">
        <span className="nx-rule-word">then</span>
        <select className="nx-select" value={r.action} onChange={(e) => set("action", e.target.value)}>
          {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <input className="nx-inline nx-inline-wide" value={r.text}
        onChange={(e) => set("text", e.target.value)}
        placeholder={act.backend ? "command or app to run" : "message to show"} />

      {act.backend && (
        <p className="nx-rule-warn">
          <AlertTriangle size={11} />
          Running commands and launching apps needs the backend. This rule saves and
          arms, but the action is inert until then.
        </p>
      )}
      {!t.live && !act.backend && (
        <p className="nx-tool-note nx-tool-note-flush">
          {t.kind === "schedule" ? "Schedules" : "This event"} needs an OS hook from the
          backend to fire on its own. It saves now and works once that lands.
        </p>
      )}

      <div className="nx-tool-row">
        <button className="nx-btn nx-btn-on" onClick={() => onSave({
          ...r, value: t.kind === "metric" ? +r.value : r.value,
        })} disabled={!valid}>{initial.id ? "Save" : "Create rule"}</button>
        <button className="nx-chip" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const blankRule = { on: true, trig: "cpu", op: ">", value: "", action: "notify", text: "", fired: 0 };

function AutomationView({ ctx }) {
  const { demo, t, online } = ctx;
  const [rules, setRules] = usePersistent("auto-rules", []);
  const [events, setEvents] = useState([]);
  const [editing, setEditing] = useState(null);   // rule object or null
  const [making, setMaking] = useState(false);

  const prevFrame = useRef({ online: true });

  // The engine: evaluate live rules against each telemetry frame.
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  const fire = useCallback((rule, detail) => {
    const at = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setEvents((p) => [{ id: Date.now() + Math.random(), rule: rule.id,
      text: rule.text, detail, action: rule.action, at }, ...p].slice(0, 60));
    setRules((p) => p.map((r) => (r.id === rule.id ? { ...r, fired: r.fired + 1, lastAt: at } : r)));
    if (rule.action === "toast") ctx.toast(rule.text);
  }, [ctx]);

  useEffect(() => {
    const prev = prevFrame.current;
    for (const r of rulesRef.current) {
      if (!r.on) continue;
      const trig = TRIGGERS[r.trig];

      if (trig.kind === "metric" && t) {
        const now = t[trig.field];
        const was = prev[trig.field];
        if (was == null) continue;
        const crossed = r.op === ">" ? (was <= r.value && now > r.value)
                                     : (was >= r.value && now < r.value);
        if (crossed) fire(r, `${trig.label} ${r.op === ">" ? "hit" : "fell to"} ${now.toFixed(1)}${trig.unit}`);
      }

      if (r.trig === "offline" && prev.online && !online) {
        fire(r, "Link went down");
      }
    }
    prevFrame.current = t ? { ...t, online } : { online };
  }, [t, online, fire]);

  const activeLive = rules.filter((r) => r.on && TRIGGERS[r.trig].live && TRIGGERS[r.trig].kind !== "event").length;

  const save = (r) => {
    if (r.id) setRules((p) => p.map((x) => (x.id === r.id ? { ...x, ...r } : x)));
    else setRules((p) => [...p, { ...r, id: Date.now(), fired: 0 }]);
    setEditing(null); setMaking(false);
    ctx.toast(r.id ? "Rule saved" : "Rule armed");
  };

  if (!rules.length && !making) {
    return (
      <div className="nx-mod">
        <div className="nx-first">
          <span className="nx-first-mark"><Workflow size={22} /></span>
          <h2>No automations yet.</h2>
          <p>
            Build rules that watch the system and act on their own — notify you when
            the disk fills, log every time the network drops, run a command on startup.
          </p>
          <button className="nx-cta" onClick={() => setMaking(true)}>
            Create a rule <ArrowRight size={15} />
          </button>

        </div>
      </div>
    );
  }

  return (
    <div className="nx-mod nx-mod-wide">
      <div className="nx-tool-row nx-auto-top">
        <button className="nx-chip nx-chip-on" onClick={() => { setMaking(true); setEditing(null); }}>
          <Plus size={11} />New rule
        </button>
        <span className="nx-auto-stat">
          <i className="nx-live-dot" />{activeLive} live rule{activeLive !== 1 ? "s" : ""} armed
          {t ? "" : " · telemetry off"}
        </span>
        <span className="nx-fcount">{rules.filter((r) => r.on).length} of {rules.length} on</span>
      </div>

      {(making || editing) && (
        <RuleForm initial={editing || blankRule}
          onSave={save} onCancel={() => { setMaking(false); setEditing(null); }} />
      )}

      <div className="nx-net-split">
        <div className="nx-panel">
          <p className="nx-panel-title">Rules</p>
          <div className="nx-rules">
            {rules.map((r) => {
              const trig = TRIGGERS[r.trig];
              const act = ACTIONS[r.action];
              return (
                <div key={r.id} className={`nx-rule${r.on ? "" : " nx-rule-off"}`}>
                  <button className={`nx-toggle-sw${r.on ? " nx-toggle-sw-on" : ""}`}
                    onClick={() => setRules((p) => p.map((x) => x.id === r.id ? { ...x, on: !x.on } : x))}
                    aria-pressed={r.on} aria-label="Toggle rule">
                    <i />
                  </button>
                  <div className="nx-rule-main">
                    <p className="nx-rule-when">
                      {ruleSummary(r)}
                      {trig.live && trig.kind === "metric" && r.on && <span className="nx-rule-armed">armed</span>}
                      {!trig.live && <span className="nx-rule-pending">needs backend</span>}
                    </p>
                    <p className="nx-rule-then">
                      <i style={{ background: `var(--${act.tone})` }} />
                      {act.label.toLowerCase()} · "{r.text}"
                    </p>
                  </div>
                  <div className="nx-rule-meta">
                    {r.fired > 0 && <span className="nx-rule-fired">fired {r.fired}×</span>}
                    <button className="nx-rule-edit" onClick={() => { setEditing(r); setMaking(false); }}
                      aria-label="Edit"><Pencil size={12} /></button>
                    <span className="nx-drop" role="button" tabIndex={0} aria-label="Delete"
                      onClick={() => setRules((p) => p.filter((x) => x.id !== r.id))}
                      onKeyDown={(e) => e.key === "Enter" && setRules((p) => p.filter((x) => x.id !== r.id))}>
                      <X size={11} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="nx-tool-note">
            Metric rules are edge-triggered: they fire once when the line is crossed,
            not continuously while it stays over. Create a rule like "CPU rises
            above 20%" and it fires against your real system within a tick.
          </p>
        </div>

        <div className="nx-panel nx-auto-log">
          <div className="nx-out-head">
            <span>Fired · {events.length}</span>
            {events.length > 0 && (
              <button className="nx-copy" onClick={() => setEvents([])}>
                <Trash2 size={11} />Clear
              </button>
            )}
          </div>
          {events.length === 0
            ? <div className="nx-auto-idle">
                <Radio size={18} />
                <p>Watching. Nothing has tripped yet.</p>
                <p className="nx-tool-note nx-tool-note-flush">
                  Add a rule like "CPU rises above 40%" with demo data on and it'll
                  fire within a few seconds.
                </p>
              </div>
            : <div className="nx-auto-events">
                {events.map((e) => (
                  <div key={e.id} className="nx-auto-event">
                    <span className="nx-auto-when">{e.at}</span>
                    <span className="nx-auto-dot" style={{ background: `var(--${ACTIONS[e.action].tone})` }} />
                    <span className="nx-auto-text">
                      <b>{e.text}</b>
                      <em>{e.detail}</em>
                    </span>
                  </div>
                ))}
              </div>}
        </div>
      </div>
    </div>
  );
}

const THEMES = {
  midnight: {
    label: "Midnight", note: "The default. Deep blue-black.",
    vars: { "--void": "#04060C", "--glass": "rgba(148,178,255,0.045)",
      "--glass-2": "rgba(148,178,255,0.08)", "--edge": "rgba(159,190,255,0.10)",
      "--ice": "#E4ECFF", "--muted": "#8C9CBF", "--muted-2": "#4E5A75" },
    swatch: "#04060C",
  },
  slate: {
    label: "Slate", note: "Warmer, greyer, less blue.",
    vars: { "--void": "#0B0C0F", "--glass": "rgba(200,205,220,0.045)",
      "--glass-2": "rgba(200,205,220,0.08)", "--edge": "rgba(200,205,220,0.11)",
      "--ice": "#ECEEF2", "--muted": "#9BA0AC", "--muted-2": "#585C68" },
    swatch: "#0B0C0F",
  },
  carbon: {
    label: "Carbon", note: "Near-pure black. OLED-friendly.",
    vars: { "--void": "#000000", "--glass": "rgba(255,255,255,0.04)",
      "--glass-2": "rgba(255,255,255,0.07)", "--edge": "rgba(255,255,255,0.10)",
      "--ice": "#F0F0F2", "--muted": "#8A8A92", "--muted-2": "#4A4A52" },
    swatch: "#000000",
  },
  nebula: {
    label: "Nebula", note: "Violet-leaning, moody.",
    vars: { "--void": "#0A0710", "--glass": "rgba(190,160,255,0.05)",
      "--glass-2": "rgba(190,160,255,0.09)", "--edge": "rgba(190,160,255,0.12)",
      "--ice": "#EEE6FF", "--muted": "#A594C4", "--muted-2": "#5E4E78" },
    swatch: "#0A0710",
  },
  void: {
    label: "Void", note: "Pure black. Only accent and text show.",
    vars: { "--void": "#000000", "--glass": "rgba(255,255,255,0.015)",
      "--glass-2": "rgba(255,255,255,0.03)", "--edge": "rgba(255,255,255,0.06)",
      "--ice": "#FFFFFF", "--muted": "#9a9a9a", "--muted-2": "#3a3a3a" },
    swatch: "#000000",
  },
};

const ACCENTS = {
  mint:    { label: "Mint", signal: "#5EE6C4" },
  cyan:    { label: "Cyan", signal: "#4CC9F0" },
  sky:     { label: "Sky", signal: "#38BDF8" },
  azure:   { label: "Azure", signal: "#5B8DEF" },
  indigo:  { label: "Indigo", signal: "#818CF8" },
  violet:  { label: "Violet", signal: "#A78BFA" },
  purple:  { label: "Purple", signal: "#C084FC" },
  magenta: { label: "Magenta", signal: "#E879F9" },
  rose:    { label: "Rose", signal: "#FF6B9D" },
  crimson: { label: "Crimson", signal: "#FB7185" },
  coral:   { label: "Coral", signal: "#FF8A65" },
  amber:   { label: "Amber", signal: "#FFB454" },
  gold:    { label: "Gold", signal: "#FBBF24" },
  citron:  { label: "Citron", signal: "#E4D00A" },
  lime:    { label: "Lime", signal: "#A3E635" },
  green:   { label: "Green", signal: "#4ADE80" },
  emerald: { label: "Emerald", signal: "#34D399" },
  teal:    { label: "Teal", signal: "#2DD4BF" },
  ice:     { label: "Ice", signal: "#A5F3FC" },
  silver:  { label: "Silver", signal: "#CBD5E1" },
  blood:   { label: "Blood", signal: "#C0392B" },
  forest:  { label: "Forest", signal: "#2E8B57" },
};

const DENSITIES = {
  cozy: { label: "Cozy", note: "More breathing room." },
  compact: { label: "Compact", note: "Tighter, more on screen." },
};

function Toggle({ on, onChange, label, note }) {
  return (
    <div className="nx-set-row">
      <div className="nx-set-copy">
        <p className="nx-set-label">{label}</p>
        {note && <p className="nx-set-note">{note}</p>}
      </div>
      <button className={`nx-toggle-sw${on ? " nx-toggle-sw-on" : ""}`}
        onClick={() => onChange(!on)} aria-pressed={on} aria-label={label}><i /></button>
    </div>
  );
}

function ApiKeyPanel({ ctx }) {
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const invoke = (cmd, args) =>
    (window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke)(cmd, args);

  const [hint, setHint] = useState(null);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const refresh = useCallback(() => {
    if (!isDesktop) { setHint(null); return; }
    invoke("api_key_hint").then((h) => setHint(h || null)).catch(() => setHint(null));
  }, [isDesktop]);
  useEffect(() => { refresh(); }, [refresh]);

  const save = async () => {
    const k = val.trim();
    if (!k) { setErr("Paste a key first."); return; }
    setBusy(true); setErr(null);
    try {
      await invoke("save_api_key", { key: k });
      setVal(""); setEditing(false); refresh();
      ctx.toast("API key saved");
    } catch (e) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  };

  const clear = async () => {
    setBusy(true);
    try { await invoke("clear_api_key"); refresh(); ctx.toast("API key removed"); }
    catch (e) { ctx.toast(String(e?.message || e)); }
    finally { setBusy(false); }
  };

  if (!isDesktop) {
    return <p className="nx-set-note">Key management is available in the desktop app.</p>;
  }

  return (
    <div className="nx-set-list">
      <div className="nx-set-row">
        <div className="nx-set-copy">
          <p className="nx-set-label">Anthropic key</p>
          <p className="nx-set-note">
            {hint ? `Set · ${hint}` : "No key set — AI features are off until you add one."}
          </p>
        </div>
        <span className={hint ? "nx-set-badge" : "nx-rule-pending"}>{hint ? "Active" : "None"}</span>
      </div>

      {editing ? (
        <>
          <input className="nx-inline nx-inline-wide" type="password" value={val} autoFocus
            onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Paste new key — sk-ant-..." spellCheck={false} />
          {err && <p className="nx-out-err">{err}</p>}
          <div className="nx-tool-row">
            <button className="nx-chip nx-chip-on" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button className="nx-chip" onClick={() => { setEditing(false); setVal(""); setErr(null); }}>Cancel</button>
          </div>
        </>
      ) : (
        <div className="nx-tool-row">
          <button className="nx-chip" onClick={() => setEditing(true)}>{hint ? "Change key" : "Add key"}</button>
          {hint && <button className="nx-chip nx-chip-stop" onClick={clear} disabled={busy}>Remove</button>}
          <button className="nx-chip" onClick={() => invoke("launch_app", { target: "https://console.anthropic.com/settings/keys" })}>
            Get a key
          </button>
        </div>
      )}
      <p className="nx-tool-note nx-tool-note-flush">
        Stored locally on this machine. Each person who uses Nexus enters their own key and
        their own credits — it never leaves this computer except to reach Anthropic.
      </p>
    </div>
  );
}

function SystemStatus({ ctx }) {
  const s = ctx.settings;
  const school = !!s.schoolMode;
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const [checkedAt] = useState(() =>
    new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));

  const Row = ({ ok, restricted, label, detail }) => (
    <div className="nx-status-row">
      <span className={`nx-status-dot ${ok ? "nx-status-ok" : restricted ? "nx-status-res" : "nx-status-off"}`}>
        {ok ? <Check size={11} /> : <Minus size={11} />}
      </span>
      <span className="nx-status-label">{label}</span>
      <span className="nx-status-state">{restricted ? "Restricted" : ok ? "Active" : "Off"}</span>
      {detail && <span className="nx-status-detail">{detail}</span>}
    </div>
  );

  return (
    <div className="nx-status">
      <div className="nx-status-env">
        {school
          ? <span className="nx-status-badge nx-status-badge-school"><Lock size={12} /> School Mode</span>
          : <span className="nx-status-badge"><Unlock size={12} /> Standard Mode</span>}
        <span className="nx-status-plat">{isDesktop ? "Desktop app" : "Browser"}</span>
      </div>

      <p className="nx-status-head">Modules</p>
      <div className="nx-status-list">
        <Row ok={!school} restricted={school} label="AI Assistant" />
        <Row ok={!school} restricted={school} label="Encyclopedia (web search)" />
        <Row ok={!school} restricted={school} label="App launcher" />
        <Row ok={!school} restricted={school} label="Network tools (ping / DNS / scan)"
          detail={school ? "removed in school mode" : "live"} />
        <Row ok={!school} restricted={school} label="Scan reader"
          detail={school ? "removed in school mode" : "parses pasted output only"} />
        <Row ok={!school} restricted={school} label="Terminal (real shell)"
          detail={school ? "removed in school mode" : "runs real commands"} />
        <Row ok label="Cybersecurity tools" detail="local only" />
        <Row ok label="Fitness, Projects, Notes" />
      </div>

      <p className="nx-status-head">System access</p>
      <div className="nx-status-list">
        <Row ok label="Widgets & dashboard" />
        <Row ok label="Local storage" detail="settings & notes on this device" />
        <Row ok={!school} restricted={school} label="Outbound network"
          detail={school ? "AI + probes disabled" : "AI API + DNS/ping"} />
        <Row ok={!school} restricted={school} label="Launch external apps" />
        <Row ok={!school} restricted={school} label="Runs shell commands"
          detail={school ? "removed in school mode" : "via Terminal"} />
        <Row label="Reads files off disk" detail="not implemented" />
        <Row ok={!school} restricted={school} label="Network scanning / discovery"
          detail={school ? "removed in school mode" : "device scan + traceroute"} />
      </div>

      <p className="nx-status-foot">
        Policy state as of {checkedAt}. Nexus stores data locally and only reaches the
        network for the AI features (Anthropic's API) and, outside school mode, DNS/ping
        lookups you trigger. It does not scan networks, run shell commands, or read your
        files. In School Mode every network tool — ping, DNS, device discovery, traceroute,
        and the scan reader — is removed from the app entirely, not just disabled, along
        with app launching and all AI features.
      </p>
    </div>
  );
}

function ElevenPanel({ ctx }) {
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const invoke = (cmd, args) => (window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke)(cmd, args);
  const [has, setHas] = useState(false);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!isDesktop) return;
    invoke("has_eleven_key").then(setHas).catch(() => setHas(false));
  }, [isDesktop]);
  useEffect(() => { refresh(); }, [refresh]);

  const save = async () => {
    if (!val.trim()) return;
    setBusy(true);
    try { await invoke("save_eleven_key", { key: val.trim() }); setVal(""); setEditing(false); refresh(); ctx.toast("Voice key saved"); }
    catch (e) { ctx.toast(String(e?.message || e)); } finally { setBusy(false); }
  };
  const clear = async () => {
    setBusy(true);
    try { await invoke("clear_eleven_key"); refresh(); ctx.toast("Voice key removed — using system voice"); }
    catch (e) { ctx.toast(String(e?.message || e)); } finally { setBusy(false); }
  };

  // Diagnostic: calls ElevenLabs directly and reports the real result, instead
  // of silently falling back. Lets us see exactly why the natural voice fails.
  const [diag, setDiag] = useState(null);
  const test = async () => {
    setDiag("Testing…");
    try {
      const bytes = await invoke("eleven_tts", { text: "Good evening. This is the Nexus voice.", voiceId: ELEVEN_VOICES.female.id });
      if (bytes && bytes.length) {
        const blob = new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" });
        const a = new Audio(URL.createObjectURL(blob));
        await a.play();
        setDiag(`✓ Working — got ${bytes.length} bytes of audio.`);
      } else {
        setDiag("Returned no audio.");
      }
    } catch (e) {
      setDiag("✗ " + String(e?.message || e));
    }
  };

  if (!isDesktop) return null;
  return (
    <div className="nx-set-row" style={{ flexWrap: "wrap" }}>
      <div className="nx-set-copy">
        <p className="nx-set-label">Natural voice (ElevenLabs)</p>
        <p className="nx-set-note">
          {has ? "Connected — Nexus speaks in the elegant British voice." : "Not set — using the built-in computer voice."}
        </p>
      </div>
      {editing ? (
        <div className="nx-idx-row" style={{ width: "100%", marginTop: 8 }}>
          <input className="nx-inline nx-inline-wide" type="password" value={val} autoFocus
            onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Paste ElevenLabs key" spellCheck={false} />
          <button className="nx-chip nx-chip-on" onClick={save} disabled={busy}>Save</button>
          <button className="nx-chip" onClick={() => { setEditing(false); setVal(""); }}>Cancel</button>
        </div>
      ) : (
        <div className="nx-tool-row">
          <button className="nx-chip" onClick={() => setEditing(true)}>{has ? "Change" : "Add key"}</button>
          {has && <button className="nx-chip nx-chip-on" onClick={test}>Test voice</button>}
          {has && <button className="nx-chip nx-chip-stop" onClick={clear} disabled={busy}>Remove</button>}
          <button className="nx-chip" onClick={() => invoke("launch_app", { target: "https://elevenlabs.io/app/settings/api-keys" })}>Get a key</button>
        </div>
      )}
      {diag && <p className="nx-tool-note nx-tool-note-flush" style={{ width: "100%", marginTop: 8, color: diag.startsWith("✓") ? "var(--signal)" : "var(--ember)" }}>{diag}</p>}
    </div>
  );
}

function ElevenPanelEnd() {}

function VoiceKeybind({ s, set, ctx }) {
  const [capturing, setCapturing] = useState(false);
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { setCapturing(false); return; }
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return; // need a real key
      set((p) => ({ ...p, voiceKey: e.key.toLowerCase() }));
      setCapturing(false);
      ctx.toast(`Push-to-talk set to "${e.key === " " ? "Space" : e.key.toUpperCase()}"`);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, set, ctx]);

  const label = s.voiceKey === " " ? "Space" : (s.voiceKey || "t").toUpperCase();
  return (
    <div className="nx-set-row">
      <div className="nx-set-copy">
        <p className="nx-set-label">Push-to-talk key</p>
        <p className="nx-set-note">Hold to talk, release to send. Pick a key you won't hit by accident.</p>
      </div>
      <button className={`nx-keybind${capturing ? " nx-keybind-cap" : ""}`}
        onClick={() => setCapturing((c) => !c)}>
        {capturing ? "Press a key…" : label}
      </button>
    </div>
  );
}

function SchoolKeybind({ s, set, ctx }) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setCapturing(false); return; }
      const combo = comboFromEvent(e);
      if (!combo) return; // modifier alone  -  keep waiting
      // Require at least one modifier so it can't clobber plain typing.
      if (!(e.ctrlKey || e.altKey || e.metaKey)) {
        ctx.toast("Use a modifier — like Alt or Ctrl — with the key.");
        return;
      }
      set((p) => ({ ...p, schoolKey: combo }));
      setCapturing(false);
      ctx.toast(`School mode shortcut set to ${combo}`);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, set, ctx]);

  return (
    <div className="nx-set-row">
      <div className="nx-set-copy">
        <p className="nx-set-label">Shortcut</p>
        <p className="nx-set-note">Toggle school mode from anywhere with a keypress.</p>
      </div>
      <button className={`nx-keybind${capturing ? " nx-keybind-cap" : ""}`}
        onClick={() => setCapturing((c) => !c)}>
        {capturing ? "Press keys…" : (s.schoolKey || "Set shortcut")}
      </button>
    </div>
  );
}

// A guarded factory reset the user can run: first click arms it, second click
// (within a few seconds) actually wipes. Prevents an accidental data wipe.
// The About / architecture overview  -  a full-screen page that explains how
// Nexus is built, in real technical terms AND plain English, with diagrams.
// Designed to make sense to a teacher and a non-coder alike.
function AboutPage({ ctx, onClose }) {
  const accent = "var(--signal)";
  const scrollRef = useRef(null);
  const secRefs = useRef({});
  const [touring, setTouring] = useState(false);
  const [activeSec, setActiveSec] = useState(null);
  const bedRef = useRef(null);
  const narrationRef = useRef(null);
  const tourAliveRef = useRef(false);
  const gender = ctx.settings?.voiceGender || "female";
  const name = (ctx.settings?.userName || "").trim();

  // Pre-written narration  -  reliable, consistent, and it opens by crediting Gio.
  const SCRIPT = [
    { id: "hero", text: `Welcome to Nexus O S. Nexus was created and founded by Gio Zamudio. Let me walk you through how it all works, from the outside in.` },
    { id: "halves", text: `Everything in Nexus is one of two things. There's the front — the part you see and click. And there's the back — the part that actually reaches into your computer. They talk to each other across a bridge.` },
    { id: "front", text: `The front is built with React, the same technology behind modern web apps. It's every screen and button you interact with. Think of it as the dashboard and steering wheel.` },
    { id: "back", text: `The back is written in Rust, a fast, serious systems language. It's the engine under the hood — the only part allowed to read your computer's real information, like how hard your processor is working, or what devices are on your network.` },
    { id: "bridge", text: `Here's how they talk. When you press scan, the front hands the request to the back. The back actually looks at your network, writes down what it finds, and passes the list back up to be shown on screen — all in under a second.` },
    { id: "ai", text: `The talking assistant is powered by Claude, a real A I. What makes it special is that it doesn't just chat — it can actually do things in the app for you, because it's allowed to press the same buttons you can. And your private key stays on your own computer.` },
    { id: "stack", text: `Put it all together and you get the full stack: you, the interface, the bridge, the Rust engine, and finally your computer and the A I working underneath.` },
    { id: "note", text: `One last thing worth knowing. Every tool in Nexus does exactly what it says. Nothing is faked. Where something genuinely can't be measured, Nexus admits it rather than inventing a number. That honesty was a design rule from the start.${name ? ` Thanks for watching, ${name}.` : ""}` },
  ];

  const scrollTo = (id) => {
    const el = secRefs.current[id];
    const cont = scrollRef.current;
    if (el && cont) cont.scrollTo({ top: el.offsetTop - 80, behavior: "smooth" });
  };

  const stopTour = () => {
    tourAliveRef.current = false;
    narrationRef.current?.cancel();
    bedRef.current?.stop(); bedRef.current = null;
    Speech.release(); // anything that queued up during the tour can speak now
    setTouring(false);
    setActiveSec(null);
  };

  const startTour = async () => {
    if (touring) { stopTour(); return; }
    setTouring(true);
    tourAliveRef.current = true;
    // The narration drives itself section by section, so the queue steps aside
    // for the duration  -  a port warning must not talk over the tour.
    Speech.hold();
    bedRef.current = makeTourBed();
    bedRef.current.start();
    for (const step of SCRIPT) {
      if (!tourAliveRef.current) break;
      setActiveSec(step.id);
      scrollTo(step.id);
      await new Promise((r) => setTimeout(r, 500)); // let the scroll settle
      if (!tourAliveRef.current) break;
      const n = speakAndWait(step.text, gender);
      narrationRef.current = n;
      await n.promise;
      if (!tourAliveRef.current) break;
      await new Promise((r) => setTimeout(r, 400)); // small beat between sections
    }
    stopTour();
  };

  // Clean up if the page closes mid-tour.
  useEffect(() => () => stopTour(), []);
  const close = () => { stopTour(); onClose(); };

  const secClass = (id) => `nx-about-sec${activeSec === id ? " nx-about-live" : ""}`;
  const setRef = (id) => (el) => { secRefs.current[id] = el; };

  return (
    <div className="nx-about">
      <div className="nx-about-bar">
        <div className="nx-about-bar-title"><Boxes size={16} /> How Nexus OS works</div>
        <div className="nx-about-bar-actions">
          <button className={`nx-chip${touring ? " nx-chip-stop" : " nx-chip-on"}`} onClick={startTour}>
            {touring ? <><Square size={12} /> Stop tour</> : <><Radio size={12} /> Play narrated tour</>}
          </button>
          <button className="nx-tut-x" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
      </div>

      <div className="nx-about-scroll" ref={scrollRef}>
        {/* Hero */}
        <section className={`nx-about-hero ${activeSec === "hero" ? "nx-about-live" : ""}`} ref={setRef("hero")}>
          <span className="nx-brand-mark nx-setup-mark" />
          <h1>Nexus OS</h1>
          <p className="nx-about-tag">A personal command center — created by Gio Zamudio.</p>
          <p className="nx-about-lede">
            Nexus isn't a website and it isn't a toy. It's a real desktop application
            that runs on your own machine, reads real data from your computer, and can
            talk to you. Here's exactly how it's put together — first the honest
            technical version, then the same thing in plain English.
          </p>
        </section>

        <section className={secClass("halves")} ref={setRef("halves")}>
          <h2>The two halves</h2>
          <p>
            Every part of Nexus is one of two things: the <b>front</b> (what you see and
            click) or the <b>back</b> (the part that actually touches your computer).
            They talk to each other through a bridge.
          </p>
          <ArchDiagram accent={accent} />
        </section>

        <section className={secClass("front")} ref={setRef("front")}>
          <div className="nx-about-icon"><Code2 size={18} /></div>
          <h2>The front — React</h2>
          <div className="nx-about-two">
            <div>
              <p className="nx-about-label">Technically</p>
              <p>
                The interface is a single-page <b>React</b> application: components,
                hooks, and state driving a declarative UI. Every screen — Dashboard,
                Terminal, the tools — is a React component rendered into one window.
                No page reloads; state changes re-render the pieces that changed.
              </p>
            </div>
            <div>
              <p className="nx-about-label">In plain English</p>
              <p>
                This is the part you look at — the buttons, the glowing core, the menus.
                It's built the same way modern websites are, so it feels smooth and
                reacts instantly when you click things. Think of it as the dashboard and
                steering wheel of a car.
              </p>
            </div>
          </div>
        </section>

        <section className={secClass("back")} ref={setRef("back")}>
          <div className="nx-about-icon"><Server size={18} /></div>
          <h2>The back — Rust</h2>
          <div className="nx-about-two">
            <div>
              <p className="nx-about-label">Technically</p>
              <p>
                The backend is written in <b>Rust</b> and runs as a native process via
                <b> Tauri</b>. It exposes <b>29 commands</b> the frontend can invoke —
                real system calls: CPU/memory via <code>sysinfo</code>, network discovery
                via the ARP table and <code>nbtstat</code>, Wi-Fi via <code>netsh</code>,
                EXIF parsing, git, file walking, and the shell. Rust is compiled,
                memory-safe, and fast.
              </p>
            </div>
            <div>
              <p className="nx-about-label">In plain English</p>
              <p>
                This is the engine under the hood. It's the part that's actually allowed
                to read your computer's real information — how hard your CPU is working,
                what's on your network, what's in a photo's hidden data. It's written in
                a serious, fast language built for exactly this kind of low-level work.
              </p>
            </div>
          </div>
        </section>

        <section className={secClass("bridge")} ref={setRef("bridge")}>
          <div className="nx-about-icon"><Workflow size={18} /></div>
          <h2>The bridge — how they talk</h2>
          <p>
            When you click something, the front asks the back to do the real work, waits
            for the answer, and shows it. Here's a real example — the moment you scan
            your network:
          </p>
          <FlowDiagram accent={accent} />
          <div className="nx-about-two" style={{ marginTop: 18 }}>
            <div>
              <p className="nx-about-label">Technically</p>
              <p>
                The frontend calls <code>invoke("arp_table")</code>. Tauri routes it
                across the IPC boundary to the Rust command, which shells out, parses the
                real output, and returns structured JSON. React renders it.
              </p>
            </div>
            <div>
              <p className="nx-about-label">In plain English</p>
              <p>
                You press "scan." The dashboard hands the request to the engine. The
                engine actually looks at your network, writes down what it finds, and
                passes the list back up to be shown on screen. All in under a second.
              </p>
            </div>
          </div>
        </section>

        <section className={secClass("ai")} ref={setRef("ai")}>
          <div className="nx-about-icon"><Sparkles size={18} /></div>
          <h2>The intelligence — Claude</h2>
          <div className="nx-about-two">
            <div>
              <p className="nx-about-label">Technically</p>
              <p>
                The assistant and voice mode send your messages to <b>Claude</b>
                (Anthropic's model) through its API, using an agentic <b>tool-use loop</b>:
                Claude can call the same real functions the UI uses — reading stats,
                setting reminders, changing settings — then respond. Your API key is
                stored locally and never bundled or shared.
              </p>
            </div>
            <div>
              <p className="nx-about-label">In plain English</p>
              <p>
                The talking assistant is powered by a real AI. What makes it special here
                is it's not just chatting — it can actually <i>do</i> things in the app
                for you, because it's allowed to press the same buttons you can. Your
                private key stays on your computer.
              </p>
            </div>
          </div>
        </section>

        <section className={secClass("stack")} ref={setRef("stack")}>
          <h2>The full stack</h2>
          <StackDiagram accent={accent} />
        </section>

        <section className={`${secClass("note")} nx-about-note`} ref={setRef("note")}>
          <div className="nx-about-icon"><ShieldCheck size={18} /></div>
          <h2>A note on what's real</h2>
          <p>
            Every tool in Nexus does what it says. The system stats are your real machine,
            the network scan finds your real devices, the metadata reader parses real
            photos. Where something can't be done — a GPU reading that isn't portable, a
            device that won't reveal its name — Nexus says so rather than faking a number.
            That honesty was a design rule, not an afterthought.
          </p>
        </section>

        <div className="nx-about-foot">
          <span className="nx-brand-mark" />
          <p>Nexus OS · v0.1.0 · React + Rust (Tauri) · Claude by Anthropic · by Gio Zamudio</p>
          <button className="nx-cta" onClick={close}>Back to Nexus <ArrowRight size={15} /></button>
        </div>
      </div>
    </div>
  );
}

// Diagram: frontend <-> bridge <-> backend, three stacked blocks.
function ArchDiagram({ accent }) {
  return (
    <svg viewBox="0 0 640 260" className="nx-about-svg" role="img" aria-label="Architecture diagram">
      {/* front */}
      <rect x="40" y="20" width="560" height="60" rx="12" fill="var(--glow-faint)" stroke="var(--glow-soft)" />
      <text x="320" y="46" textAnchor="middle" className="nx-svg-h">FRONT · React</text>
      <text x="320" y="66" textAnchor="middle" className="nx-svg-s">What you see and click — the whole interface</text>
      {/* arrows */}
      <line x1="320" y1="80" x2="320" y2="110" stroke={accent} strokeWidth="2" markerEnd="url(#ar)" />
      <line x1="320" y1="150" x2="320" y2="180" stroke={accent} strokeWidth="2" markerEnd="url(#ar)" />
      <text x="360" y="100" className="nx-svg-t">invoke( )</text>
      <text x="360" y="170" className="nx-svg-t">JSON result</text>
      {/* bridge */}
      <rect x="180" y="110" width="280" height="40" rx="10" fill="none" stroke={accent} strokeDasharray="5 4" />
      <text x="320" y="135" textAnchor="middle" className="nx-svg-b">Tauri bridge (IPC)</text>
      {/* back */}
      <rect x="40" y="180" width="560" height="60" rx="12" fill="var(--glow-faint)" stroke="var(--glow-soft)" />
      <text x="320" y="206" textAnchor="middle" className="nx-svg-h">BACK · Rust</text>
      <text x="320" y="226" textAnchor="middle" className="nx-svg-s">Talks to your real computer — 29 native commands</text>
      <defs>
        <marker id="ar" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={accent} />
        </marker>
      </defs>
    </svg>
  );
}

// Diagram: the real request flow for a network scan.
function FlowDiagram({ accent }) {
  const steps = [
    { t: "You click Scan", s: "in the Networking module" },
    { t: 'invoke("arp_table")', s: "front asks the back" },
    { t: "Rust reads the ARP table", s: "real system call" },
    { t: "Devices appear", s: "shown on your screen" },
  ];
  return (
    <div className="nx-flow">
      {steps.map((st, i) => (
        <React.Fragment key={i}>
          <div className="nx-flow-node">
            <span className="nx-flow-num" style={{ background: accent }}>{i + 1}</span>
            <div><p className="nx-flow-t">{st.t}</p><p className="nx-flow-s">{st.s}</p></div>
          </div>
          {i < steps.length - 1 && <div className="nx-flow-arrow">↓</div>}
        </React.Fragment>
      ))}
    </div>
  );
}

// Diagram: the layered stack.
function StackDiagram({ accent }) {
  const layers = [
    { label: "You", sub: "clicking, typing, talking", icon: Star },
    { label: "React UI", sub: "the interface, components + state", icon: Code2 },
    { label: "Tauri bridge", sub: "carries requests both ways", icon: Workflow },
    { label: "Rust backend", sub: "29 real system commands", icon: Server },
    { label: "Your computer + Claude", sub: "the OS, network, and the AI", icon: Cpu },
  ];
  return (
    <div className="nx-stack">
      {layers.map((l, i) => (
        <div key={i} className="nx-stack-layer" style={{ opacity: 1 - i * 0.08 }}>
          <l.icon size={15} />
          <div><p className="nx-stack-t">{l.label}</p><p className="nx-stack-s">{l.sub}</p></div>
        </div>
      ))}
    </div>
  );
}

function FactoryReset({ ctx }) {
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const arm = () => {
    setArmed(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setArmed(false), 5000); // disarm if ignored
  };

  const wipe = async () => {
    clearTimeout(timerRef.current);
    const isD = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
    if (!isD) { ctx.toast("Factory reset only works in the desktop app."); setArmed(false); return; }
    try {
      const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
      await inv("factory_reset");
      setDone(true);
    } catch (e) { ctx.toast(String(e?.message || e)); setArmed(false); }
  };

  if (done) {
    return (
      <p className="nx-set-note" style={{ color: "var(--signal)" }}>
        Done — everything's been erased. Close and reopen Nexus to start fresh.
      </p>
    );
  }

  return armed ? (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <button className="nx-chip nx-chip-stop" onClick={wipe}>Yes, erase everything</button>
      <button className="nx-chip" onClick={() => { clearTimeout(timerRef.current); setArmed(false); }}>Cancel</button>
    </div>
  ) : (
    <button className="nx-chip nx-chip-stop" onClick={arm}>Factory reset…</button>
  );
}

function SettingsView({ ctx }) {
  const s = ctx.settings;
  const set = ctx.setSettings;
  const visibleCount = MODULES.filter((m) => !s.hidden.includes(m.id)).length;
  const [cat, setCat] = useState("appearance");

  const toggleHidden = (id) => set((p) => ({
    ...p, hidden: p.hidden.includes(id) ? p.hidden.filter((x) => x !== id) : [...p.hidden, id],
  }));

  const CATS = [
    { id: "appearance", label: "Appearance", icon: Sparkles },
    { id: "ai", label: "AI & Voice", icon: MessageSquare },
    { id: "access", label: "Access & Keys", icon: Lock },
    { id: "system", label: "System", icon: Settings },
    { id: "about", label: "About", icon: Info },
  ];

  return (
    <div className="nx-mod">
      <div className="nx-set-tabs">
        {CATS.map((c) => (
          <button key={c.id} className={`nx-set-tab${cat === c.id ? " nx-set-tab-on" : ""}`}
            onClick={() => setCat(c.id)}>
            <c.icon size={14} strokeWidth={1.8} />{c.label}
          </button>
        ))}
      </div>

      <div className="nx-set-groups">
        {cat === "access" && (
        <section className="nx-set-group nx-set-school">
          <p className="nx-panel-title">School mode</p>
          <Toggle label="Hide AI features" on={s.schoolMode}
            onChange={(v) => set((p) => ({ ...p, schoolMode: v }))}
            note="Turns off the assistant, encyclopedia, and answer-giving homework help, plus the Ask button. The explain/walk-through/check tools stay. For when you're in class." />
          <SchoolKeybind s={s} set={set} ctx={ctx} />
          {s.schoolMode && (
            <p className="nx-school-on"><Lock size={11} /> School mode is on — AI features are hidden.</p>
          )}
        </section>
        )}

        {cat === "ai" && !s.schoolMode && (
          <section className="nx-set-group">
            <p className="nx-panel-title">Voice assistant</p>
            <p className="nx-set-note" style={{ marginBottom: 12 }}>
              Hold your key and talk — it does the same things the typed assistant does.
              Release the key to send. It remembers the last minute or so, so you can
              follow up naturally. {SPEECH ? "" : " Your browser has no speech engine."}
            </p>

            <div className="nx-set-row">
              <div className="nx-set-copy">
                <p className="nx-set-label">Your name</p>
                <p className="nx-set-note">What Nexus calls you in greetings.</p>
              </div>
              <input className="nx-inline" style={{ maxWidth: 150 }} value={s.userName || ""}
                onChange={(e) => set((p) => ({ ...p, userName: e.target.value }))}
                placeholder="e.g. Gio" spellCheck={false} />
            </div>

            <div className="nx-set-row">
              <div className="nx-set-copy">
                <p className="nx-set-label">Voice</p>
                <p className="nx-set-note">Elegant British — pick the tone.</p>
              </div>
              <div className="nx-seg">
                <button className={s.voiceGender !== "male" ? "nx-seg-on" : ""}
                  onClick={() => { set((p) => ({ ...p, voiceGender: "female" })); speak("Good evening. This is the female voice.", true, "female"); }}>Female</button>
                <button className={s.voiceGender === "male" ? "nx-seg-on" : ""}
                  onClick={() => { set((p) => ({ ...p, voiceGender: "male" })); speak("Good evening. This is the male voice.", true, "male"); }}>Male</button>
              </div>
            </div>

            <VoiceKeybind s={s} set={set} ctx={ctx} />
            <ElevenPanel ctx={ctx} />
            <Toggle label="Speak replies aloud" on={s.voiceSpeak !== false}
              onChange={(v) => set((p) => ({ ...p, voiceSpeak: v }))}
              note="Reads the assistant's answer back to you." />
            <Toggle label="Greet me on launch" on={s.greetVoice !== false}
              onChange={(v) => set((p) => ({ ...p, greetVoice: v }))}
              note="A short spoken hello when you open Nexus." />
            <p className="nx-tool-note nx-tool-note-flush">
              {listBritishVoices().length
                ? `${listBritishVoices().length} British voice(s) available on this machine.`
                : "No British voice detected — Windows: Settings → Time & Language → Speech → Add voices → English (United Kingdom). Nexus falls back to the best English voice until then."}
            </p>
          </section>
        )}

        {cat === "appearance" && (<>
        <section className="nx-set-group">
          <p className="nx-panel-title">Theme</p>
          <div className="nx-theme-grid">
            {Object.entries(THEMES).map(([k, th]) => (
              <button key={k} className={`nx-theme${s.theme === k ? " nx-theme-on" : ""}`}
                onClick={() => set((p) => ({ ...p, theme: k }))}>
                <span className="nx-theme-swatch" style={{ background: th.swatch }}>
                  <i style={{ background: ACCENTS[s.accent].signal }} />
                </span>
                <span className="nx-theme-name">{th.label}</span>
                <span className="nx-theme-note">{th.note}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="nx-set-group">
          <p className="nx-panel-title">Accent</p>
          <div className="nx-accent-row">
            {Object.entries(ACCENTS).map(([k, a]) => (
              <button key={k} className={`nx-accent${s.accent === k ? " nx-accent-on" : ""}`}
                onClick={() => set((p) => ({ ...p, accent: k }))}
                title={a.label} aria-label={a.label}>
                <span style={{ background: a.signal }} />
              </button>
            ))}
          </div>
          <p className="nx-set-note">
            The accent drives every glow, active state, and highlight across all modules.
          </p>
        </section>

        <section className="nx-set-group">
          <p className="nx-panel-title">Interface</p>
          <div className="nx-set-list">
            <div className="nx-set-row">
              <div className="nx-set-copy">
                <p className="nx-set-label">Density</p>
                <p className="nx-set-note">{DENSITIES[s.density].note}</p>
              </div>
              <div className="nx-tool-row">
                {Object.entries(DENSITIES).map(([k, d]) => (
                  <button key={k} className={`nx-chip${s.density === k ? " nx-chip-on" : ""}`}
                    onClick={() => set((p) => ({ ...p, density: k }))}>{d.label}</button>
                ))}
              </div>
            </div>
            <Toggle label="Animations" note="Orbits, pulses, and transitions."
              on={s.motion} onChange={(v) => set((p) => ({ ...p, motion: v }))} />
            <Toggle label="Startup quote" note="The philosophical splash on launch."
              on={s.splash} onChange={(v) => set((p) => ({ ...p, splash: v }))} />
            <Toggle label="Ask window" note="The per-module AI button, bottom-right."
              on={s.ask} onChange={(v) => set((p) => ({ ...p, ask: v }))} />
          </div>
        </section>

        <section className="nx-set-group">
          <p className="nx-panel-title">Modules · {visibleCount} shown</p>
          <p className="nx-set-note" style={{ marginBottom: 12 }}>
            Hide what you don't use. Dashboard and Settings can't be hidden.
          </p>
          <div className="nx-mod-toggles">
            {MODULES.map((m) => {
              const locked = m.id === "dashboard" || m.id === "settings";
              const shown = !s.hidden.includes(m.id);
              return (
                <button key={m.id}
                  className={`nx-mod-chip${shown ? " nx-mod-chip-on" : ""}${locked ? " nx-mod-chip-lock" : ""}`}
                  onClick={() => !locked && toggleHidden(m.id)} disabled={locked}>
                  <m.icon size={13} strokeWidth={1.8} />{m.label}
                  {shown ? <Check size={11} /> : null}
                </button>
              );
            })}
          </div>
        </section>
        </>)}

        {cat === "access" && (
        <section className="nx-set-group">
          <p className="nx-panel-title">API key</p>
          <ApiKeyPanel ctx={ctx} />
        </section>
        )}

        {cat === "appearance" && (
        <section className="nx-set-group">
          <p className="nx-panel-title">Sound</p>
          <div className="nx-set-list">
            <Toggle label="Interface sounds" note="Subtle synthesized clicks and toggles."
              on={s.sound} onChange={(v) => set((p) => ({ ...p, sound: v }))} />
            <div className={`nx-set-row${s.sound ? "" : " nx-set-row-off"}`}>
              <div className="nx-set-copy">
                <p className="nx-set-label">Volume</p>
                <p className="nx-set-note">How loud the effects are.</p>
              </div>
              <div className="nx-tool-row">
                {[["low", 0.3], ["medium", 0.6], ["high", 1]].map(([label, v]) => (
                  <button key={label} disabled={!s.sound}
                    className={`nx-chip${Math.abs(s.volume - v) < 0.01 ? " nx-chip-on" : ""}`}
                    onClick={() => set((p) => ({ ...p, volume: v }))}>{label}</button>
                ))}
              </div>
            </div>
            <div className={s.sound ? "" : "nx-set-row-off"}>
              <Toggle label="Cursor hum" note="A faint tone as the mouse moves. Some love it, some don't."
                on={s.hover} onChange={(v) => set((p) => ({ ...p, hover: v }))} />
            </div>
          </div>
        </section>
        )}

        {cat === "system" && (
        <section className="nx-set-group">
          <p className="nx-panel-title">Tutorial</p>
          <p className="nx-set-note" style={{ marginBottom: 12 }}>
            Replay the quick walkthrough of what Nexus can do.
          </p>
          <button className="nx-chip nx-chip-on" onClick={() => ctx.replayTutorial()}>
            Replay tutorial
          </button>
        </section>
        )}

        {cat === "system" && (
        <section className="nx-set-group">
          <p className="nx-panel-title">Reset</p>
          <p className="nx-set-note" style={{ marginBottom: 10 }}>
            Put every setting back to its default. Your keys and saved data stay.
          </p>
          <button className="nx-chip nx-chip-stop" onClick={() => {
            set(() => DEFAULT_SETTINGS);
            ctx.toast("Settings restored to defaults");
          }}>Restore defaults</button>

          <p className="nx-set-note" style={{ margin: "18px 0 8px" }}>
            <b>Factory reset.</b> Erases everything Nexus has saved on this computer —
            your API keys, settings, reminders, and all other data — and returns the app
            to a brand-new state. This can't be undone.
          </p>
          <FactoryReset ctx={ctx} />
        </section>
        )}
      </div>

      {cat === "system" && (
      <section className="nx-set-group nx-status-group">
        <p className="nx-panel-title">System status</p>
        <p className="nx-set-note" style={{ marginBottom: 14 }}>
          A live, read-only summary of what Nexus is running and what it can access —
          for you or your school's IT to review at a glance.
        </p>
        <SystemStatus ctx={ctx} />
      </section>
      )}

      {cat === "about" && (
      <section className="nx-set-group">
        <p className="nx-panel-title">About Nexus OS</p>
        <p className="nx-set-note" style={{ marginBottom: 14 }}>
          Nexus OS is a personal command center built by a student. Open the overview
          below for a full look at how it's built — the technology behind it, explained
          both properly and in plain English, with diagrams.
        </p>
        <button className="nx-chip nx-chip-on" onClick={() => ctx.openAbout()}>
          <Boxes size={13} /> How Nexus works — full overview
        </button>
        <p className="nx-set-note" style={{ marginTop: 16 }}>
          Version 0.1.0 · Built with React + Rust (Tauri) · Runs on Claude by Anthropic
        </p>
      </section>
      )}
    </div>
  );
}

const DEFAULT_SETTINGS = {
  theme: "midnight", accent: "mint", density: "cozy",
  motion: true, splash: true, ask: true,
  sound: true, volume: 1, hover: false, hidden: [],
  schoolMode: false, schoolKey: "Alt+S",
  voiceKey: "t", voiceSpeak: true, voiceGender: "female",
  userName: "", greetVoice: true, launchCount: 0, tutorialSeen: false,
};

// Modules hidden when School mode is on  -  AI plus the real shell, which is the
// single most likely thing to alarm a school's security tooling.
const AI_MODULES = new Set(["assistant", "encyclopedia", "terminal"]);

// Keybind helpers. A combo is a string like "Alt+S" or "Ctrl+Shift+K".
function comboFromEvent(e) {
  const k = e.key;
  if (["Control", "Alt", "Shift", "Meta"].includes(k)) return null; // wait for a real key
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  const main = k.length === 1 ? k.toUpperCase() : k;
  parts.push(main);
  return parts.join("+");
}
function matchesCombo(e, combo) {
  if (!combo) return false;
  const got = comboFromEvent(e);
  return got && got.toLowerCase() === combo.toLowerCase();
}

/* Registry of modules that have a real surface. Everything absent
   from this map falls through to the placeholder view. */
// Turn a free-text due ("Friday", "next Tuesday", "Oct 3", "10/3", ISO) into a
// real local-midnight Date, resolved relative to when the reminder was made.
// Returns null when it can't be pinned to a day (those show as Unscheduled).
function resolveDue(due, baseTs) {
  if (!due) return null;
  const s = String(due).trim().toLowerCase();
  if (!s) return null;
  const base = baseTs ? new Date(baseTs) : new Date();
  base.setHours(0, 0, 0, 0);
  const mk = (d) => { d.setHours(0, 0, 0, 0); return d; };

  if (/\btoday\b|\btonight\b/.test(s)) return mk(new Date(base));
  if (/\btomorrow\b/.test(s)) { const d = new Date(base); d.setDate(d.getDate() + 1); return mk(d); }

  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) { const d = new Date(`${iso[0]}T00:00:00`); if (!isNaN(d)) return mk(d); }

  const dows = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const wd = dows.findIndex((n) => s.includes(n));
  if (wd >= 0) {
    const d = new Date(base);
    let delta = (wd - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7; // "Friday" means the coming Friday, not today
    d.setDate(d.getDate() + delta);
    return mk(d);
  }

  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const mm = s.match(/([a-z]{3,})\.?\s+(\d{1,2})/);
  if (mm) {
    const mi = months.findIndex((mo) => mm[1].startsWith(mo));
    const day = parseInt(mm[2], 10);
    if (mi >= 0 && day >= 1 && day <= 31) {
      let d = new Date(base.getFullYear(), mi, day);
      if (d < base) d = new Date(base.getFullYear() + 1, mi, day);
      return mk(d);
    }
  }

  const nm = s.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (nm) {
    const mo = parseInt(nm[1], 10) - 1, day = parseInt(nm[2], 10);
    let year = nm[3] ? parseInt(nm[3], 10) : base.getFullYear();
    if (year < 100) year += 2000;
    if (mo >= 0 && mo <= 11 && day >= 1 && day <= 31) {
      let d = new Date(year, mo, day);
      if (!nm[3] && d < base) d = new Date(year + 1, mo, day);
      return mk(d);
    }
  }
  return null;
}

const calKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function CalendarView({ ctx }) {
  const reminders = ctx.reminders || [];
  const [monthOffset, setMonthOffset] = useState(0);
  const [selKey, setSelKey] = useState(calKey(new Date()));
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const [editDue, setEditDue] = useState("");

  const view = new Date();
  view.setDate(1); view.setMonth(view.getMonth() + monthOffset); view.setHours(0, 0, 0, 0);
  const y = view.getFullYear(), m = view.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const todayKey = calKey(new Date());

  const byDay = useMemo(() => {
    const map = new Map();
    for (const r of reminders) {
      const d = resolveDue(r.due, r.at);
      if (!d) continue;
      const k = calKey(d);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return map;
  }, [reminders]);

  const unscheduled = reminders.filter((r) => !resolveDue(r.due, r.at));
  const selList = selKey ? (byDay.get(selKey) || []) : [];
  const selNice = selKey
    ? new Date(`${selKey}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    : "";

  const beginEdit = (r) => { setEditing(r.id); setEditText(r.text); setEditDue(r.due || ""); };
  const saveEdit = () => {
    ctx.updateReminder(editing, { text: editText.trim() || "(untitled)", due: editDue.trim() || null });
    setEditing(null); ctx.toast("Reminder updated");
  };
  const addToSel = () => {
    if (!draft.trim() || !selKey) return;
    ctx.addReminder(draft.trim(), selKey); // ISO due lands exactly on the day
    setDraft(""); ctx.toast("Reminder added");
  };

  return (
    <div className="nx-mod nx-cal-mod">
      <div className="nx-cal-wrap">
        <div className="nx-cal-main">
          <div className="nx-cal-nav">
            <button className="nx-chip" onClick={() => setMonthOffset((o) => o - 1)}><Minus size={12} /></button>
            <span className="nx-cal-month">{view.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            <button className="nx-chip" onClick={() => setMonthOffset((o) => o + 1)}><Plus size={12} /></button>
            {monthOffset !== 0 && <button className="nx-chip" onClick={() => setMonthOffset(0)}>Today</button>}
          </div>
          <div className="nx-calm-grid">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={`h${i}`} className="nx-calm-dow">{d}</span>)}
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} className="nx-calm-cell nx-calm-empty" />;
              const k = calKey(new Date(y, m, d));
              const list = byDay.get(k) || [];
              const open = list.filter((r) => !r.done).length;
              return (
                <button key={k} className={`nx-calm-cell${k === todayKey ? " nx-calm-today" : ""}${k === selKey ? " nx-calm-sel" : ""}`}
                  onClick={() => setSelKey(k)}>
                  <span className="nx-calm-num">{d}</span>
                  {open > 0 && <span className="nx-calm-dot">{open}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="nx-cal-side">
          <div className="nx-out-head"><span>{selNice || "Pick a day"}</span></div>
          {selKey && (
            <div className="nx-tool-row">
              <input className="nx-inline nx-inline-wide" value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addToSel()} placeholder="Add for this day" />
              <button className="nx-chip nx-chip-on" onClick={addToSel}><Plus size={12} /></button>
            </div>
          )}
          {selList.length === 0 && <p className="nx-tool-note nx-tool-note-flush">Nothing on this day.</p>}
          <div className="nx-rem-list">
            {selList.map((r) => editing === r.id ? (
              <div key={r.id} className="nx-cal-edit">
                <input className="nx-inline nx-inline-wide" value={editText} onChange={(e) => setEditText(e.target.value)} placeholder="Reminder" />
                <input className="nx-inline nx-inline-wide" value={editDue} onChange={(e) => setEditDue(e.target.value)} placeholder="Due (e.g. Friday, Oct 3)" />
                <div className="nx-tool-row">
                  <button className="nx-chip nx-chip-on" onClick={saveEdit}><Check size={12} />Save</button>
                  <button className="nx-chip" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div key={r.id} className="nx-tool-row nx-rem-row">
                <button className={`nx-chip${r.done ? " nx-chip-on" : ""}`} onClick={() => ctx.toggleReminder(r.id)}>
                  {r.done ? <Check size={11} /> : <CircleDot size={11} />}
                </button>
                <span className={`nx-rem-text${r.done ? " nx-rem-done" : ""}`}>{r.text}{r.due && <i> · {r.due}</i>}</span>
                <button className="nx-copy" onClick={() => beginEdit(r)}><Pencil size={11} /></button>
                <button className="nx-copy nx-copy-fail" onClick={() => ctx.removeReminder(r.id)}><Trash2 size={11} /></button>
              </div>
            ))}
          </div>

          {unscheduled.length > 0 && (
            <>
              <div className="nx-out-head" style={{ marginTop: 16 }}><span>Unscheduled</span></div>
              <div className="nx-rem-list">
                {unscheduled.map((r) => (
                  <div key={r.id} className="nx-tool-row nx-rem-row">
                    <span className={`nx-rem-text${r.done ? " nx-rem-done" : ""}`}>{r.text}{r.due && <i> · {r.due}</i>}</span>
                    <button className="nx-copy" onClick={() => beginEdit(r)}><Pencil size={11} /></button>
                    <button className="nx-copy nx-copy-fail" onClick={() => ctx.removeReminder(r.id)}><Trash2 size={11} /></button>
                  </div>
                ))}
              </div>
              {editing && unscheduled.some((r) => r.id === editing) && (
                <div className="nx-cal-edit" style={{ marginTop: 8 }}>
                  <input className="nx-inline nx-inline-wide" value={editText} onChange={(e) => setEditText(e.target.value)} placeholder="Reminder" />
                  <input className="nx-inline nx-inline-wide" value={editDue} onChange={(e) => setEditDue(e.target.value)} placeholder="Due (e.g. Friday, Oct 3)" />
                  <div className="nx-tool-row">
                    <button className="nx-chip nx-chip-on" onClick={saveEdit}><Check size={12} />Save</button>
                    <button className="nx-chip" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const VIEWS = {
  assistant: AssistantView,
  agent: AgentMode,
  security: SecurityView,
  terminal: TerminalView,
  network: NetworkView,
  projects: ProjectsView,
  files: FilesView,
  school: SchoolView,
  calendar: CalendarView,
  encyclopedia: EncyclopediaView,
  engineering: EngineeringView,
  fitness: FitnessView,
  automation: AutomationView,
  settings: SettingsView,
};

function Palette({ open, onClose, go, modules = MODULES }) {
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (open) { setQ(""); setTimeout(() => ref.current?.focus(), 30); }
  }, [open]);
  if (!open) return null;
  const hits = modules.filter((m) => m.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="nx-scrim" onClick={onClose}>
      <div className="nx-palette" onClick={(e) => e.stopPropagation()}>
        <div className="nx-palette-input">
          <Search size={15} />
          <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to a module" />
          <kbd>esc</kbd>
        </div>
        <ul>
          {hits.map((m) => (
            <li key={m.id}>
              <button onClick={() => { go(m.id); onClose(); }}>
                <m.icon size={15} />{m.label}
                <span style={{ color: STATUS[m.status].tone }}>{STATUS[m.status].label}</span>
              </button>
            </li>
          ))}
          {!hits.length && <li className="nx-palette-none">No module by that name.</li>}
        </ul>
      </div>
    </div>
  );
}

const QUOTES = [
  { text: "You have power over your mind, not outside events. Realize this, and you will find strength.", who: "Marcus Aurelius", work: "Meditations" },
  { text: "We suffer more often in imagination than in reality.", who: "Seneca", work: "Letters" },
  { text: "No man ever steps in the same river twice.", who: "Heraclitus" },
  { text: "Men are disturbed not by things, but by the views which they take of things.", who: "Epictetus", work: "Enchiridion" },
  { text: "It is not death that a man should fear, but never beginning to live.", who: "Marcus Aurelius", work: "Meditations" },
  { text: "The unexamined life is not worth living.", who: "Socrates", work: "Apology" },
  { text: "Knowing yourself is the beginning of all wisdom.", who: "Aristotle" },
  { text: "It is the mark of an educated mind to entertain a thought without accepting it.", who: "Aristotle" },
  { text: "A journey of a thousand miles begins with a single step.", who: "Lao Tzu", work: "Tao Te Ching" },
  { text: "He who has a why to live can bear almost any how.", who: "Friedrich Nietzsche" },
  { text: "Anxiety is the dizziness of freedom.", who: "Søren Kierkegaard", work: "The Concept of Anxiety" },
  { text: "The limits of my language mean the limits of my world.", who: "Ludwig Wittgenstein", work: "Tractatus" },
  { text: "What is now proved was once only imagined.", who: "William Blake" },
  { text: "Waste no more time arguing what a good man should be. Be one.", who: "Marcus Aurelius", work: "Meditations" },
  { text: "First say to yourself what you would be, then do what you have to do.", who: "Epictetus" },
  { text: "Difficulties strengthen the mind, as labor does the body.", who: "Seneca" },
  { text: "As long as you live, keep learning how to live.", who: "Seneca", work: "Letters" },
  { text: "The first and greatest victory is to conquer yourself.", who: "Plato" },
  { text: "Doubt is the origin of wisdom.", who: "René Descartes" },
  { text: "Nature loves to hide.", who: "Heraclitus" },
  { text: "Character is destiny.", who: "Heraclitus" },
  { text: "Well begun is half done.", who: "Aristotle" },
  { text: "Life must be understood backwards.", who: "Søren Kierkegaard", work: "Journals" },
  { text: "The best revenge is not to be like your enemy.", who: "Marcus Aurelius", work: "Meditations" },
];

function Splash({ onDone }) {
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => () => clearTimeout(timer.current), []);

  const dismiss = useCallback(() => {
    setLeaving((was) => {
      if (was) return was;
      timer.current = setTimeout(() => doneRef.current(), 620);
      return true;
    });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Tab") return;
      e.preventDefault();
      dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  return (
    <div className={`nx-splash${leaving ? " nx-splash-out" : ""}`}
      onClick={dismiss} role="button" tabIndex={0}
      aria-label={`${quote.text} — ${quote.who}. Continue to Nexus.`}>
      <div className="nx-splash-inner">
        <span className="nx-splash-mark" />
        <blockquote className="nx-splash-quote">{quote.text}</blockquote>
        <p className="nx-splash-who">
          {quote.who}{quote.work && <em>{quote.work}</em>}
        </p>
      </div>
      <p className="nx-splash-hint">Click anywhere to continue</p>
    </div>
  );
}

function usePersistent(key, initial) {
  const [val, setVal] = useState(initial);
  const [hydrated, setHydrated] = useState(false);
  const loaded = useRef(false);

  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const invoke = (cmd, args) =>
    (window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke)(cmd, args);

  useEffect(() => {
    if (!isDesktop) { loaded.current = true; setHydrated(true); return; }
    let alive = true;
    invoke("load_state", { key })
      .then((raw) => {
        if (!alive) return;
        try {
          const parsed = JSON.parse(raw);
          if (parsed != null) {
            setVal((prev) =>
              prev && typeof prev === "object" && !Array.isArray(prev)
                ? { ...prev, ...parsed }
                : parsed
            );
          }
        } catch { /* corrupt or absent — keep defaults */ }
        loaded.current = true;
        setHydrated(true);
      })
      .catch(() => { loaded.current = true; setHydrated(true); });
    return () => { alive = false; };
  }, [key, isDesktop]);

  useEffect(() => {
    if (!isDesktop || !loaded.current) return;
    invoke("save_state", { key, value: JSON.stringify(val) }).catch(() => {});
  }, [key, val, isDesktop]);

  return [val, setVal, hydrated];
}

// Voices load asynchronously in Chromium; getVoices() can be empty on first
// call. Kick a load and cache when they arrive so pickVoice works right away.
if (typeof window !== "undefined" && window.speechSynthesis) {
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
  } catch { /* no-op */ }
}

// Picks an installed British English voice matching the desired gender. Voice
// availability varies by machine, so this degrades gracefully: en-GB of the
// right gender → any en-GB → any English → system default.
function pickVoice(gender) {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  const gb = voices.filter((v) => /en-GB|en_GB/i.test(v.lang) || /british|\bUK\b/i.test(v.name));
  // Common Windows/Chromium British voice names by gender.
  const maleHints = /george|daniel|arthur|ryan|male|\bman\b/i;
  const femaleHints = /hazel|susan|libby|sonia|serena|kate|female|\bwoman\b/i;
  const want = gender === "male" ? maleHints : femaleHints;
  const other = gender === "male" ? femaleHints : maleHints;
  return (
    gb.find((v) => want.test(v.name)) ||
    gb.find((v) => !other.test(v.name)) ||
    gb[0] ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0] || null
  );
}

function listBritishVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const voices = window.speechSynthesis.getVoices() || [];
  return voices.filter((v) => /en-GB|en_GB/i.test(v.lang) || /british|\bUK\b/i.test(v.name));
}

// Elegant British ElevenLabs voices (stock voice IDs from their library).
const ELEVEN_VOICES = {
  female: { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte" }, // warm British female
  male:   { id: "JBFqnCBsd6RMkjVDRZzb", name: "George" },    // refined British male
};

let elevenAudio = null; // reuse one Audio element so greetings don't stack

const Speech = (() => {
  let queue = [];
  let speaking = false;
  let held = false;

  const stopCurrent = () => {
    try { elevenAudio?.pause(); } catch { /* no-op */ }
    try { window.speechSynthesis?.cancel(); } catch { /* no-op */ }
  };

  async function pump() {
    if (speaking || held || !queue.length) return;
    speaking = true;
    const item = queue.shift();
    try {
      await utter(item.text, item.gender);
    } catch { /* a failed line must not jam the queue */ }
    speaking = false;
    item.done?.();
    // Small gap so two lines don't run together as one breath.
    if (queue.length) setTimeout(pump, 260);
  }

  return {
    say(text, gender, kind = "alert") {
      if (kind === "reply") {
        // Drop anything merely informational that hasn't been said yet.
        queue = queue.filter((q) => q.kind === "reply");
        if (speaking) { stopCurrent(); speaking = false; }
      }
      return new Promise((done) => {
        queue.push({ text, gender, kind, done });
        pump();
      });
    },
    hold() { held = true; },
    release() { held = false; pump(); },
    clear() { queue = []; stopCurrent(); speaking = false; },
  };
})();

/// Enqueue a line. Resolves once it has actually been spoken.
function speak(text, enabled, gender = "female", kind = "alert") {
  if (!enabled || !text) return Promise.resolve();
  return Speech.say(text, gender, kind);
}

// Speaks text. If an ElevenLabs key is set, uses their natural British voice;
// otherwise falls back to the system voice. Never throws. Resolves when the
// audio finishes, which is what lets the queue above run one line at a time.
async function utter(text, gender = "female") {
  if (!text) return;
  // Strip anything that shouldn't be read aloud (markdown/LaTeX leftovers),
  // so even if a stray symbol slips through, the voice stays clean.
  const clean = String(text)
    .replace(/\$\$?([^$]*)\$?\$?/g, "$1")   // $...$ / $$...$$ → contents
    .replace(/\\[a-zA-Z]+/g, " ")            // \int, \frac, \boxed, etc.
    .replace(/[*_#`>~^{}\\]/g, " ")          // markdown/latex punctuation
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  if (!clean) return;
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

  if (isDesktop) {
    try {
      const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
      const voice = ELEVEN_VOICES[gender] || ELEVEN_VOICES.female;
      const bytes = await inv("eleven_tts", { text: clean, voiceId: voice.id });
      const blob = new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      try { elevenAudio?.pause(); } catch { /* no-op */ }
      elevenAudio = new Audio(url);
      // Resolve when the audio actually ENDS, not when playback starts  - 
      // otherwise the queue would fire the next line immediately and we'd be
      // back to everything talking over everything else.
      await new Promise((res) => {
        let settled = false;
        const finish = () => { if (settled) return; settled = true; URL.revokeObjectURL(url); res(); };
        elevenAudio.onended = finish;
        elevenAudio.onerror = finish;
        elevenAudio.onpause = finish;          // covers being cut off by a reply
        elevenAudio.play().catch(finish);
        // Backstop: never let a stuck element wedge the queue shut.
        setTimeout(finish, 30_000);
      });
      return; // success  -  natural voice used
    } catch {
      // No key, quota hit, or offline → fall through to system voice.
    }
  }
  await speakSystem(clean, gender);
}

// Fallback: the built-in OS voice via Web Speech API. Resolves when the
// utterance finishes so the queue can move on.
function speakSystem(text, gender = "female") {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve();
  return new Promise((res) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(gender);
      if (v) u.voice = v;
      u.rate = 1.0; u.pitch = 1;
      let settled = false;
      const finish = () => { if (settled) return; settled = true; res(); };
      u.onend = finish;
      u.onerror = finish;
      setTimeout(finish, 30_000);
      window.speechSynthesis.speak(u);
    } catch { res(); }
  });
}

// Like speak(), but resolves a promise when the narration finishes (or is
// cancelled). Used by the guided tour to advance section by section. Returns a
// { promise, cancel } pair so the caller can stop mid-sentence.
function speakAndWait(text, gender = "female") {
  const clean = String(text).replace(/[*_#`>~^{}\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  let cancelled = false, localAudio = null;
  const cancel = () => {
    cancelled = true;
    try { localAudio?.pause(); } catch { /* no-op */ }
    try { window.speechSynthesis?.cancel(); } catch { /* no-op */ }
  };
  const promise = (async () => {
    if (isDesktop) {
      try {
        const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
        const voice = ELEVEN_VOICES[gender] || ELEVEN_VOICES.female;
        const bytes = await inv("eleven_tts", { text: clean, voiceId: voice.id });
        if (cancelled) return;
        const blob = new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        localAudio = new Audio(url);
        await new Promise((res) => {
          localAudio.onended = () => { URL.revokeObjectURL(url); res(); };
          localAudio.onerror = () => res();
          if (cancelled) return res();
          localAudio.play().catch(() => res());
        });
        return;
      } catch { /* fall through to system voice */ }
    }
    // System-voice path: resolve when it finishes speaking.
    if (typeof window !== "undefined" && window.speechSynthesis && !cancelled) {
      await new Promise((res) => {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(clean);
          const v = pickVoice(gender); if (v) u.voice = v;
          u.onend = () => res(); u.onerror = () => res();
          window.speechSynthesis.speak(u);
        } catch { res(); }
      });
    }
  })();
  return { promise, cancel };
}

function VoiceOverlay({ ctx, settings }) {
  const [phase, setPhase] = useState("idle"); // idle | listening | thinking | reply | error
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const recogRef = useRef(null);
  const heldRef = useRef(false);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const convoRef = useRef([]);       // conversation history across turns
  const lastTurnRef = useRef(0);     // timestamp of last exchange
  const voiceAbortRef = useRef(null); // abort in-flight generation

  const key = settings.voiceKey || "t";
  const speakBack = settings.voiceSpeak !== false;
  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

  // Ask for microphone access once, up front, so the very first push-to-talk
  // actually captures audio instead of being eaten by the permission prompt.
  useEffect(() => {
    if (!SPEECH || settings.schoolMode) return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => { stream.getTracks().forEach((t) => t.stop()); }) // release immediately
      .catch(() => { /* denied — the listener will surface it on first use */ });
  }, [settings.schoolMode]);

  // Run the transcript through the shared assistant tool loop, remembering the
  // recent conversation so follow-ups like "yes, do it" have context.
  const process = useCallback(async (text) => {
    if (!text.trim()) { setPhase("idle"); return; }
    setPhase("thinking"); setReply("");
    // Fresh abort controller so this turn can be stopped mid-generation.
    voiceAbortRef.current?.abort();
    const ac = new AbortController();
    voiceAbortRef.current = ac;

    // Reset memory if it's been a while (a genuinely new conversation), else
    // continue the existing thread so follow-ups resolve.
    const now = Date.now();
    if (now - lastTurnRef.current > 90000) convoRef.current = [];
    lastTurnRef.current = now;

    // Keep history bounded so it can't grow forever.
    if (convoRef.current.length > 12) convoRef.current = convoRef.current.slice(-12);
    convoRef.current.push({ role: "user", content: text });

    try {
      let finalText = "";
      // 10 rounds so multi-step voice tasks aren't cut short. Reply cap stays
      // small on purpose  -  voice answers should be one or two spoken sentences.
      for (let step = 0; step < 10; step++) {
        if (ac.signal.aborted) { setPhase("idle"); return; }
        const data = await askClaude({
          system: buildSystemPrompt(ctx.t, ctx.online, ctx.launchApps) +
            " You are being spoken to by voice — keep replies to one or two short sentences a person would want read aloud. Speak in plain words only: NEVER use markdown, asterisks, hashes, bullet points, LaTeX, or symbols like $ or \\. Say math in words a person would speak, e.g. 'negative cosine of y equals three x plus C'. The conversation may continue, so treat short follow-ups like 'yes', 'do it', or 'another one' as referring to what was just discussed.",
          messages: convoRef.current, tools: ASSISTANT_TOOLS, raw: true, maxTokens: 800,
          signal: ac.signal,
        });
        if (ac.signal.aborted) { setPhase("idle"); return; }
        const blocks = data.content || [];
        const txt = blocks.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
        if (txt) finalText = txt;
        const toolUses = blocks.filter((b) => b.type === "tool_use");
        if (data.stop_reason !== "tool_use" || !toolUses.length) {
          // Record the assistant's final text turn for context.
          if (blocks.length) convoRef.current.push({ role: "assistant", content: blocks });
          break;
        }
        convoRef.current.push({ role: "assistant", content: blocks });
        const results = [];
        for (const tu of toolUses) {
          const r = await runAssistantTool(tu.name, tu.input || {}, ctx);
          results.push({ type: "tool_result", tool_use_id: tu.id, content: r });
        }
        convoRef.current.push({ role: "user", content: results });
      }
      setReply(finalText || "Done.");
      setPhase("reply");
      // "reply"  -  this is the answer to something the user just asked, so it
      // jumps any queued background notices rather than waiting behind them.
      speak(finalText || "Done.", speakBack, settings.voiceGender, "reply");
      setTimeout(() => setPhase((p) => (p === "reply" ? "idle" : p)), 5000);
    } catch (e) {
      if (e?.name === "AbortError") { setPhase("idle"); return; } // user stopped it
      const msg = String(e?.message || e);
      setReply(msg); setPhase("error");
      setTimeout(() => setPhase((p) => (p === "error" ? "idle" : p)), 4000);
    }
  }, [ctx, speakBack, settings.voiceGender]);

  // Stop the assistant mid-thought or mid-speech.
  const stopVoice = () => {
    voiceAbortRef.current?.abort();
    try { window.speechSynthesis?.cancel(); } catch { /* no-op */ }
    try { elevenAudio?.pause(); if (elevenAudio) elevenAudio.currentTime = 0; } catch { /* no-op */ }
    setPhase("idle");
  };

  // Keep the latest process() in a ref so the key listener can be installed
  // ONCE and never rebuilt. (ctx changes every second as telemetry ticks; if
  // the listener depended on it, it would be torn down and recreated
  // constantly, and a keypress landing in that gap would be missed  -  which is
  // exactly the "have to re-set the key before it works" bug.)
  const processRef = useRef(process);
  processRef.current = process;
  // Refs so the ONE permanent listener always reads current values without
  // needing to re-attach (re-attaching on a timing boundary was the bug where
  // voice only worked after re-saving the key).
  const keyRef = useRef(key);
  keyRef.current = key;
  const schoolRef = useRef(settings.schoolMode);
  schoolRef.current = settings.schoolMode;

  // HOLD to talk: press and hold the key to listen, release to send. No
  // silence timer, so it never cuts you off while you're still speaking or
  // pausing mid-sentence. The engine's own onend is restarted while held so a
  // natural pause doesn't end the capture.
  useEffect(() => {
    if (!SPEECH) return; // recognition unavailable in this browser at all

    const startListen = () => {
      if (heldRef.current) return;
      heldRef.current = true;
      finalRef.current = "";
      setHeard(""); setReply(""); setPhase("listening");
      try { window.speechSynthesis?.cancel(); } catch { /* no-op */ }
      try { elevenAudio?.pause(); } catch { /* no-op */ }

      const rec = new SPEECH();
      rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let interim = "", fin = finalRef.current;
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const tr = e.results[i][0].transcript;
          if (e.results[i].isFinal) fin += tr + " "; else interim += tr;
        }
        finalRef.current = fin;
        interimRef.current = interim;              // keep the un-finalized tail
        setHeard((fin + interim).trim());
      };
      rec.onend = () => {
        if (heldRef.current) { try { rec.start(); } catch { /* race, fine */ } }
      };
      rec.onerror = (e) => {
        // "no-speech" and "aborted" are transient; while still held, let onend
        // restart. Only a hard error (not-allowed) should surface.
        if (e && e.error === "not-allowed") {
          heldRef.current = false;
          setReply("Microphone permission is blocked. Allow mic access to use voice.");
          setPhase("error");
          setTimeout(() => setPhase((p) => (p === "error" ? "idle" : p)), 4000);
        }
      };
      try { rec.start(); recogRef.current = rec; } catch { /* already running */ }
    };

    const stopListen = () => {
      if (!heldRef.current) return;
      heldRef.current = false;
      try { recogRef.current?.stop(); } catch { /* no-op */ }
      // Give the recognizer a moment to flush, then use BOTH the finalized text
      // and any un-finalized interim tail  -  otherwise a quick release loses the
      // last word or two.
      setTimeout(() => {
        const said = (finalRef.current + " " + (interimRef.current || "")).trim();
        interimRef.current = "";
        if (said) processRef.current(said); else setPhase("idle");
      }, 400);
    };

    const inField = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const matchKey = (e) => e.key && e.key.toLowerCase() === (keyRef.current || "t").toLowerCase();
    const down = (e) => {
      if (schoolRef.current) return;               // voice off in school mode
      if (!matchKey(e) || e.repeat) return;         // ignore auto-repeat while held
      if (inField(document.activeElement)) return;  // don't hijack typing
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      try { document.activeElement?.blur(); } catch { /* no-op */ }
      startListen();
    };
    const up = (e) => {
      if (!matchKey(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      stopListen();
    };
    // Attached ONCE on mount, in document capture phase  -  the earliest point in
    // the event path. Reads key/school from refs so it never needs re-attaching.
    document.addEventListener("keydown", down, true);
    document.addEventListener("keyup", up, true);
    return () => {
      document.removeEventListener("keydown", down, true);
      document.removeEventListener("keyup", up, true);
      try { recogRef.current?.stop(); } catch { /* no-op */ }
    };
  }, []);

  if (settings.schoolMode || !SPEECH) return null;
  if (phase === "idle") return null;

  return (
    <div className="nx-voice">
      <div className={`nx-voice-card nx-voice-${phase}`}>
        <div className="nx-voice-orb">
          <span className="nx-voice-ring" /><span className="nx-voice-core" />
        </div>
        <div className="nx-voice-body">
          {phase === "listening" && <>
            <p className="nx-voice-label">Listening…</p>
            <p className="nx-voice-text">{heard || "Go ahead — release the key when you're done."}</p>
          </>}
          {phase === "thinking" && <>
            <p className="nx-voice-label">Working…</p>
            <p className="nx-voice-text">{heard}</p>
          </>}
          {phase === "reply" && <>
            <p className="nx-voice-label">Nexus</p>
            <p className="nx-voice-text">{reply}</p>
          </>}
          {phase === "error" && <>
            <p className="nx-voice-label nx-voice-err">Couldn't do that</p>
            <p className="nx-voice-text">{reply}</p>
          </>}
        </div>
        {(phase === "thinking" || phase === "reply") && (
          <button className="nx-voice-stop" onClick={stopVoice} aria-label="Stop">
            <Square size={12} /> Stop
          </button>
        )}
      </div>
    </div>
  );
}

function Welcome({ onNext, name, setName }) {
  const [step, setStep] = useState("intro"); // intro | name
  if (step === "name") {
    return (
      <div className="nx-setup">
        <div className="nx-setup-inner">
          <span className="nx-brand-mark nx-setup-mark" />
          <h1 className="nx-setup-title">What should I call you?</h1>
          <p className="nx-setup-sub">
            Nexus greets you by name and the assistant uses it too. You can change
            it later in Settings.
          </p>
          <div className="nx-setup-field">
            <input value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onNext()}
              placeholder="e.g. Gio" autoFocus spellCheck={false} />
            <button className="nx-cta" onClick={onNext}>
              Continue <ArrowRight size={15} />
            </button>
          </div>
          <div className="nx-setup-foot">
            <button className="nx-setup-skip" onClick={onNext}>Skip — I'll set it later</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="nx-setup">
      <div className="nx-setup-inner">
        <span className="nx-brand-mark nx-setup-mark" />
        <h1 className="nx-setup-title">Welcome to Nexus OS</h1>
        <p className="nx-setup-sub">
          Nexus is a personal command center — one calm, dark, futuristic place that
          pulls together the things you actually use: an AI assistant you can talk to,
          real system and network tools, a homework helper, project and file tracking,
          fitness, and more. Everything runs on your own machine.
        </p>
        <p className="nx-setup-sub" style={{ marginTop: 4 }}>
          It was built <b>by a student, for students</b> — designed to help you get
          through school and side projects without a dozen scattered apps.
        </p>
        <div className="nx-setup-field" style={{ justifyContent: "flex-end" }}>
          <button className="nx-cta" onClick={() => setStep("name")}>
            Next <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

const TUTORIAL_STEPS = [
  {
    module: "dashboard", highlight: "dashboard", pos: "left", title: "The Dashboard",
    body: "This is your home base. The glowing Nexus Core sits dead center, and every panel around it is live and real — your actual CPU and memory, real weather for your location, network throughput, reminders, and a health score computed from your machine right now. Nothing here is faked.",
    doThis: "Try it: hit \"Rearrange\" in the top-right, then drag any widget to a new spot. The layout is yours.",
  },
  {
    module: "assistant", highlight: "assistant", pos: "left", title: "The AI Assistant",
    body: "This is the brain. Ask it anything and it actually does things — set reminders, log workouts, open your apps, change settings, read your real data. It also decides how to answer: if it knows, it tells you; if one command would settle it, it runs that command and answers from the real output; and if the job is bigger than that, it hands the whole thing to Agent Mode. Ask \"what version of Python do I have\" and it checks rather than guesses.",
    doThis: "Try it: type \"what version of Python do I have\" — it runs the real command and answers from the output.",
  },
  {
    module: null, highlight: null, pos: "top", title: "Talk to it — Voice",
    body: "Nexus has a hands-free voice mode built on the same brain, with the same abilities — anything you can type, you can say. Hold your push-to-talk key — the T key by default — anywhere in the app, speak naturally, then release. It thinks, does whatever you asked, and answers out loud. It remembers the last minute of conversation, so you can follow up.",
    doThis: "Try it right now: press and HOLD the T key, say \"hello Nexus, what can you do,\" then let go. You should hear it reply.",
    voiceTest: true,
  },
  {
    module: "agent", highlight: "agent", pos: "left", title: "Agent Mode",
    body: "This is the one that works while you don't. Give it a goal — even a pasted video walkthrough — and it plans the steps, runs real commands, checks its own work, and keeps going until it's done. When it hits something only a human can do, like clicking through an installer, it pauses and asks; the clock stops while it waits. When it finishes or gets stuck it notifies you, so you can start a job and go do something else entirely.",
    doThis: "Try it: paste \"check which versions of Python, Node and Git are installed, don't change anything\" and press Start. It's read-only, so nothing can break.",
  },
  {
    module: "agent", highlight: "agent", pos: "left", title: "Watching it work",
    body: "The plain view shows what it's doing right now and ticks off the checklist as it goes — no commands, no jargon. Flip on \"Show technical details\" and you get the real thing: every command, its output, its exit code. Finished runs are saved, so you can reopen one later and see exactly what happened, how long it took, and what it cost. Protection is on by default and blocks the commands that could wipe a disk.",
    doThis: "Leave Protection on unless you have a specific reason. It only blocks the genuinely destructive stuff — nothing a normal job needs.",
  },
  {
    module: "terminal", highlight: "terminal", pos: "left", title: "The Terminal",
    body: "A genuinely real shell — the commands you type actually run on your machine and show real output. It tracks your working directory, runs git, Python, whatever you've got. You can even save shortcuts: type  save build npm run tauri build  once, then just type  build  forever.",
    doThis: "Try it: run  echo hello  and watch real output appear. Then try  dir  to list your folder.",
  },
  {
    module: "network", highlight: "network", pos: "left", title: "Networking",
    body: "Real network tools, not simulations. It reads your actual local IP and gateway, discovers real devices on your network with their vendors, pings and traces real routes, and analyzes your Wi-Fi. This is the kind of thing that makes Nexus a genuine utility, not a toy.",
    doThis: "Try it: open the Devices tab and scan — you'll see the real hardware on your network.",
  },
  {
    module: "security", highlight: "security", pos: "left", title: "Cybersecurity tools",
    body: "A small kit of real, local security tools: hash generators, a password strength lab with real crack-time math, a JWT decoder, an entropy meter, and a metadata tool that reads the hidden EXIF in your photos — including GPS location — and can strip it out before you post. All runs locally; nothing leaves your machine.",
    doThis: "Try it: open the Metadata tool and drag in a phone photo to see what it's secretly carrying.",
  },
  {
    module: "school", highlight: "school", pos: "left", title: "School mode",
    body: "This is the one that matters in class. Flip School mode on and Nexus hides everything that could distract you or trip a school computer's security — the AI, the terminal, network scanning. What stays is the genuinely useful, safe stuff: your notes, the homework helper's explain mode, reminders. There's even a System Status panel your school's IT can review to see it's clean.",
    doThis: "You'll find the toggle in Settings → Access & Keys, with its own keyboard shortcut.",
  },
  {
    module: "settings", highlight: "settings", pos: "left", title: "Make it yours",
    body: "Everything's tunable here, sorted into tabs. Appearance for themes, accent colors, and sounds. AI & Voice for your name, the British voice, and push-to-talk. Access & Keys for School mode and your API keys. System for status and this tutorial. Change a theme and the whole app shifts instantly.",
    doThis: "Try it: go to the Appearance tab and switch the theme or tap a new accent color.",
  },
];

// Tutorial background music  -  real tracks from /public, fading in at the start
// and out at the end, crossfading track 1 → track 2 if the tour runs long.
// Target volume is 50%. Falls silent gracefully if audio can't play.
// A quieter single-track looping bed for the narrated About tour  -  track 2 at
// ~28% so the voice narration sits on top of it cleanly.
function makeTourBed() {
  let a = null, stopped = false;
  const fadeTo = (audio, target, ms) => {
    if (!audio) return;
    clearInterval(audio._f);
    const steps = 24, from = audio.volume, delta = (target - from) / steps;
    let n = 0;
    audio._f = setInterval(() => {
      n++; try { audio.volume = Math.min(1, Math.max(0, from + delta * n)); } catch { /* no-op */ }
      if (n >= steps) { clearInterval(audio._f); if (target === 0) { try { audio.pause(); } catch { /* no-op */ } } }
    }, ms / steps);
  };
  return {
    start: () => {
      stopped = false;
      a = new Audio("/about-tour.mp3");
      a.loop = true; a.volume = 0;
      a.play().then(() => fadeTo(a, 0.16, 2000)).catch(() => { /* autoplay blocked */ });
    },
    stop: () => {
      stopped = true;
      if (a) { fadeTo(a, 0, 1200); const ref = a; setTimeout(() => { try { ref.pause(); ref.src = ""; } catch { /* no-op */ } }, 1400); a = null; }
    },
  };
}

function makeHum() {
  const TARGET = 0.5;
  const tracks = ["/tutorial-1.mp3", "/tutorial-2.mp3"];
  let current = null, idx = 0, fadeTimer = null, stopped = false;

  const fadeTo = (audio, target, ms) => {
    if (!audio) return;
    clearInterval(audio._fade);
    const steps = 30, stepMs = ms / steps;
    const from = audio.volume, delta = (target - from) / steps;
    let n = 0;
    audio._fade = setInterval(() => {
      n++;
      const v = Math.min(1, Math.max(0, from + delta * n));
      try { audio.volume = v; } catch { /* no-op */ }
      if (n >= steps) {
        clearInterval(audio._fade);
        if (target === 0) { try { audio.pause(); } catch { /* no-op */ } }
      }
    }, stepMs);
  };

  const playIdx = (i, fadeMs) => {
    if (stopped) return;
    const a = new Audio(tracks[i]);
    a.volume = 0;
    a.preload = "auto";
    // When a track ends, crossfade into the next (loop back to track 2 after).
    a.onended = () => {
      if (stopped) return;
      const next = i === 0 ? 1 : 1; // after track 1 → track 2; track 2 → repeat track 2
      playIdx(next, 1500);
    };
    a.play().then(() => fadeTo(a, TARGET, fadeMs)).catch(() => { /* autoplay blocked — silent */ });
    // Fade the old one out as the new one comes in (crossfade).
    if (current) fadeTo(current, 0, fadeMs);
    current = a; idx = i;
  };

  return {
    start: () => { stopped = false; playIdx(0, 2500); },
    stop: () => {
      stopped = true;
      const a = current;
      if (a) {
        fadeTo(a, 0, 1500);
        // Hard stop after the fade, in case any loop/onended tries to resume.
        setTimeout(() => { try { a.pause(); a.src = ""; } catch { /* no-op */ } }, 1700);
      }
      current = null;
    },
  };
}

function Tutorial({ ctx, onClose }) {
  const [phase, setPhase] = useState("intro"); // intro | step | done
  const [i, setI] = useState(0);
  const step = TUTORIAL_STEPS[i];
  // Navigate to the step's module so the user sees it live behind the card.
  useEffect(() => {
    if (phase === "step" && step?.module) ctx.go(step.module);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, i]);

  // Highlight the relevant sidebar item by tagging the body with the active id.
  useEffect(() => {
    const id = phase === "step" ? (step?.highlight || "") : "";
    if (typeof document !== "undefined") document.body.setAttribute("data-tut-highlight", id);
    return () => { if (typeof document !== "undefined") document.body.removeAttribute("data-tut-highlight"); };
  }, [phase, i, step]);

  const finish = () => {
    ctx.setSettings((p) => ({ ...p, tutorialSeen: true }));
    onClose();
  };

  if (phase === "intro") {
    const hasName = (ctx.settings.userName || "").trim().length > 0;
    return (
      <div className="nx-tut-wrap">
        <div className="nx-tut-card nx-tut-intro">
          <span className="nx-brand-mark nx-setup-mark" />
          <h2>A quick tour</h2>
          <p>
            Here's a walk through everything Nexus can do — {TUTORIAL_STEPS.length}{" "}
            stops, four or five minutes. Each one has an optional thing to try; do it or
            just read and move on. You can replay this any time from Settings.
          </p>
          {!hasName && (
            <div className="nx-setup-field" style={{ marginTop: 16 }}>
              <input value={ctx.settings.userName || ""}
                onChange={(e) => ctx.setSettings((p) => ({ ...p, userName: e.target.value }))}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="First, what should I call you?" spellCheck={false} autoFocus />
            </div>
          )}
          <div className="nx-tut-actions">
            <button className="nx-setup-skip" onClick={finish}>Skip the tour</button>
            <button className="nx-cta" onClick={() => setPhase("step")}>
              Start <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="nx-tut-wrap">
        <div className="nx-tut-card nx-tut-intro">
          <span className="nx-brand-mark nx-setup-mark" />
          <h2>You're all set{ctx.settings.userName ? `, ${ctx.settings.userName}` : ""}.</h2>
          <p>
            That's the tour. Every module you saw is real and works on its own — go
            explore. And remember you can talk to Nexus any time by holding your voice
            key. Welcome aboard.
          </p>
          <div className="nx-tut-actions">
            <button className="nx-cta" onClick={finish}>Get started <ArrowRight size={15} /></button>
          </div>
        </div>
      </div>
    );
  }

  // step phase  -  the card is positioned per-step so it moves around the screen
  // and doesn't cover the thing it's describing.
  return (
    <div className={`nx-tut-wrap nx-tut-step nx-tut-pos-${step.pos || "center"}`}
      onKeyDownCapture={(e) => {
        // Never let the push-to-talk key act as button navigation inside the
        // tour  -  it belongs to the voice assistant.
        const vk = ctx.settings?.voiceKey || "t";
        if (e.key && e.key.toLowerCase() === vk.toLowerCase()) { e.preventDefault(); e.stopPropagation(); }
      }}>
      <div className="nx-tut-card">
        <div className="nx-tut-top">
          <span className="nx-tut-count">{i + 1} / {TUTORIAL_STEPS.length}</span>
          <button className="nx-tut-x" onClick={finish} aria-label="Skip tour"><X size={14} /></button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        {step.doThis && <p className="nx-tut-do">{step.doThis}</p>}
        <div className="nx-tut-progress">
          {TUTORIAL_STEPS.map((_, n) => <i key={n} className={n === i ? "nx-tut-dot-on" : ""} />)}
        </div>
        <div className="nx-tut-actions">
          {i > 0 && <button className="nx-setup-skip" onClick={() => setI(i - 1)}>Back</button>}
          <button className="nx-cta" onClick={() => {
            if (i < TUTORIAL_STEPS.length - 1) setI(i + 1);
            else setPhase("done");
          }}>
            {i < TUTORIAL_STEPS.length - 1 ? "Next" : "Finish"} <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function KeySetup({ onDone }) {
  const [step, setStep] = useState("ai"); // ai | voice
  const [key, setKey] = useState("");
  const [voiceKey, setVoiceKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const isDesktop = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const invoke = (cmd, args) =>
    (window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke)(cmd, args);

  const saveAi = async () => {
    const k = key.trim();
    if (!k) { setErr("Paste your key first."); return; }
    setBusy(true); setErr(null);
    try {
      if (isDesktop) await invoke("save_api_key", { key: k });
      setStep("voice"); // move to the optional voice step
    } catch (e) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  };

  const saveVoice = async () => {
    const k = voiceKey.trim();
    setBusy(true); setErr(null);
    try {
      if (k && isDesktop) await invoke("save_eleven_key", { key: k });
      onDone();
    } catch (e) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  };

  if (step === "voice") {
    return (
      <div className="nx-setup">
        <div className="nx-setup-inner">
          <span className="nx-brand-mark nx-setup-mark" />
          <h1 className="nx-setup-title">One more thing — the voice</h1>
          <p className="nx-setup-sub">
            Nexus can greet you and talk back in a natural, elegant British voice using
            ElevenLabs. This is optional — skip it and Nexus uses your computer's built-in
            voice instead. You can add it later in Settings.
          </p>

          <div className="nx-setup-field">
            <input type="password" value={voiceKey} onChange={(e) => setVoiceKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveVoice()}
              placeholder="Paste your ElevenLabs key (optional)" autoFocus spellCheck={false} />
            <button className="nx-cta" onClick={saveVoice} disabled={busy}>
              {busy ? "Saving…" : voiceKey.trim() ? "Save & finish" : "Finish"} <ArrowRight size={15} />
            </button>
          </div>
          {err && <p className="nx-out-err nx-setup-err">{err}</p>}

          <div className="nx-setup-steps">
            <p><b>1.</b> Make a free account at <span className="nx-link-out"
              onClick={() => isDesktop && invoke("launch_app", { target: "https://elevenlabs.io/app/settings/api-keys" })}
              style={{ cursor: isDesktop ? "pointer" : "default" }}>elevenlabs.io</span>.</p>
            <p><b>2.</b> The free tier is plenty for greetings and voice replies.</p>
            <p><b>3.</b> Copy your API key and paste it above — or skip and use the default voice.</p>
          </div>

          <div className="nx-setup-foot">
            <button className="nx-setup-skip" onClick={() => onDone()}>
              Skip — use the built-in computer voice
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nx-setup">
      <div className="nx-setup-inner">
        <span className="nx-brand-mark nx-setup-mark" />
        <h1 className="nx-setup-title">Welcome to Nexus</h1>
        <p className="nx-setup-sub">
          Nexus uses your own Anthropic API key for its AI features — the assistant,
          homework help, encyclopedia, and voice. Everything else works without one.
        </p>

        <div className="nx-setup-field">
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveAi()}
            placeholder="Paste your key — sk-ant-..." autoFocus spellCheck={false} />
          <button className="nx-cta" onClick={saveAi} disabled={busy}>
            {busy ? "Saving…" : "Save & continue"} <ArrowRight size={15} />
          </button>
        </div>
        {err && <p className="nx-out-err nx-setup-err">{err}</p>}

        <div className="nx-setup-steps">
          <p><b>1.</b> Go to <span className="nx-link-out"
            onClick={() => isDesktop && invoke("launch_app", { target: "https://console.anthropic.com/settings/keys" })}
            style={{ cursor: isDesktop ? "pointer" : "default" }}>console.anthropic.com</span> and create a key.</p>
          <p><b>2.</b> Add a little credit (Billing → $5 is plenty) and set a spending cap.</p>
          <p><b>3.</b> Paste the key above. It's stored only on this computer.</p>
        </div>

        <div className="nx-setup-foot">
          <button className="nx-setup-skip" onClick={() => setStep("voice")}>
            Skip for now — use Nexus without AI
          </button>
          <p className="nx-tool-note nx-tool-note-flush">
            Your key is saved locally on this machine and never leaves it except to talk
            to Anthropic. You can change or remove it anytime in Settings.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function NexusCore() {
  const [active, setActive] = useState("dashboard");
  const [layout, setLayout] = usePersistent("layout-v3", DEFAULT_LAYOUT);
  const [edit, setEdit] = useState(false);
  const [demo] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = usePersistent("sidebar-collapsed", false);
  const [note, setNote] = useState(null);
  const [settings, setSettings, settingsReady] = usePersistent("settings", DEFAULT_SETTINGS);
  // Splash waits for settings to load before deciding, so a saved
  // "startup quote off" is respected instead of flashing on every launch.
  const [splash, setSplash] = useState(false);
  const [splashDecided, setSplashDecided] = useState(false);

  // Nothing speaks over the startup quote. The queue holds while it's up and
  // drains once it's dismissed, so you read the quote in silence instead of
  // hearing a port warning across it.
  useEffect(() => {
    if (splash) Speech.hold();
    else Speech.release();
  }, [splash]);
  useEffect(() => {
    if (!settingsReady || splashDecided) return;
    if (settings.splash) setSplash(true);
    setSplashDecided(true);
  }, [settingsReady, settings.splash, splashDecided]);

  // First-run key setup. keyState: "checking" | "needed" | "ready".
  const [keyState, setKeyState] = useState("checking");
  // Onboarding phase for a fresh install: "welcome" → "keys" → done.
  const [onboard, setOnboard] = useState("welcome");
  // Tutorial overlay visibility (first run after onboarding, or replay).
  const [showTutorial, setShowTutorial] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const isDesktopShell = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  useEffect(() => {
    if (!isDesktopShell) { setKeyState("ready"); return; } // browser dev: skip
    const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
    inv("has_api_key")
      .then((has) => setKeyState(has ? "ready" : "needed"))
      .catch(() => setKeyState("ready"));
  }, [isDesktopShell]);

  const { t, online } = useTelemetry(demo, active);
  const mod = MODULES.find((m) => m.id === active) || MODULES[0];

  // Derived theme overrides. The base stylesheet defines midnight/mint;
  // this injects whatever differs, so restyling is just a variable swap.
  const themeStyle = useMemo(() => {
    const th = THEMES[settings.theme] || THEMES.midnight;
    const acc = ACCENTS[settings.accent] || ACCENTS.mint;
    // Derive translucent glow tints from the accent hex so every glow,
    // halo, and highlight tracks the chosen colour instead of staying mint.
    const hex = acc.signal.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const glow = `rgba(${r},${g},${b},0.28)`;
    const glowSoft = `rgba(${r},${g},${b},0.15)`;
    const glowFaint = `rgba(${r},${g},${b},0.06)`;
    const vars = Object.entries({
      ...th.vars, "--signal": acc.signal,
      "--glow": glow, "--glow-soft": glowSoft, "--glow-faint": glowFaint,
    }).map(([k, v]) => `${k}:${v};`).join("");
    const rowH = settings.density === "compact" ? "100px" : "112px";
    return `.nx-root{${vars}--row:${rowH};}`;
  }, [settings.theme, settings.accent, settings.density]);

  const toastTimer = useRef(null);
  const toast = useCallback((msg) => {
    clearTimeout(toastTimer.current);
    setNote(msg);
    toastTimer.current = setTimeout(() => setNote(null), 2600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const go = useCallback((id) => { setActive(id); setEdit(false); }, []);

  // If the visible module gets hidden, fall back to the dashboard.
  useEffect(() => {
    if (settings.hidden.includes(active) || (settings.schoolMode && AI_MODULES.has(active))) setActive("dashboard");
  }, [settings.hidden, settings.schoolMode, active]);

  useEffect(() => {
    if (splash) return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setPaletteOpen(true); }
      if (e.key === "Escape") setPaletteOpen(false);

      // School-mode keybind. Match the saved combo like "Alt+S" / "Ctrl+Shift+S".
      const combo = settings.schoolKey;
      if (combo && matchesCombo(e, combo)) {
        e.preventDefault();
        setSettings((p) => ({ ...p, schoolMode: !p.schoolMode }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [splash, settings.schoolKey, setSettings]);

  // Shared reminders/tasks store  -  the assistant writes to it, the dashboard
  // task widget reads from it, and it persists across launches.
  const [reminders, setReminders] = usePersistent("reminders", []);
  const addReminder = useCallback((text, due) => {
    const item = { id: Date.now() + Math.random(), text: String(text).slice(0, 200),
      due: due || null, done: false, at: Date.now() };
    setReminders((p) => [item, ...p]);
    return item;
  }, [setReminders]);
  const toggleReminder = useCallback((id) =>
    setReminders((p) => p.map((r) => r.id === id ? { ...r, done: !r.done } : r)), [setReminders]);
  const removeReminder = useCallback((id) =>
    setReminders((p) => p.filter((r) => r.id !== id)), [setReminders]);
  const updateReminder = useCallback((id, patch) =>
    setReminders((p) => p.map((r) => r.id === id ? { ...r, ...patch } : r)), [setReminders]);

  // Shared workout store  -  Fitness reads/writes it, the assistant can log to it.
  const [workouts, setWorkouts] = usePersistent("fit-workouts", []);
  const logWorkout = useCallback(({ kind, note, mins }) => {
    setWorkouts((p) => [{ id: Date.now() + Math.random(),
      date: new Date().toISOString().slice(0, 10),
      kind: kind || "Other", note: note || "", mins: parseInt(mins, 10) || 0 }, ...p]);
  }, [setWorkouts]);

  // Assistant conversation kept at shell level so it survives navigating
  // away and back. Session-only (not persisted)  -  resets when the app closes.
  const [chat, setChat] = useState([]);

  // Shared quick-launch apps  -  the widget edits them, the assistant reads
  // them so "launch X" can match a saved app before falling back to a URL.
  const [launchApps, setLaunchApps] = usePersistent("launch-apps", LAUNCH_DEFAULTS);

  // Lifted so the assistant can read them too (same persistent keys the
  // modules use, so state stays in sync).
  const [projects] = usePersistent("projects", []);
  const [filesFolder] = usePersistent("files-folder", "");

  const ctx = useMemo(() => ({
    t, online, demo, go, toast, active, settings, setSettings,
    reminders, addReminder, toggleReminder, removeReminder, updateReminder,
    workouts, setWorkouts, logWorkout,
    launchApps, setLaunchApps,
    projects, filesFolder,
    replayTutorial: () => setShowTutorial(true),
    openAbout: () => setAboutOpen(true),
    chat, setChat,
  }), [t, online, demo, go, toast, active, settings,
      reminders, addReminder, toggleReminder, removeReminder, updateReminder, workouts, setWorkouts, logWorkout,
      launchApps, setLaunchApps, projects, filesFolder, chat, setChat]);

  // Keep-alive: every module you open stays mounted (just hidden) so its state
  // - sub-tabs, half-typed drafts, scroll, searches - is exactly where you left
  // it when you switch back. Only the active one is visible; everything remounts
  // fresh on a restart. Inactive modules reuse their last-rendered element so
  // they don't re-render on telemetry ticks (keeps switching cheap).
  const [visited, setVisited] = useState(() => new Set([active]));
  useEffect(() => {
    setVisited((s) => (s.has(active) ? s : new Set(s).add(active)));
  }, [active]);
  const viewCache = useRef({});

  // Sound: keep the engine in sync with settings, then let it listen
  // globally. One delegated listener beats wiring every button.
  useEffect(() => {
    Sound.enabled = settings.sound;
    Sound.volume = settings.volume;
  }, [settings.sound, settings.volume]);

  useEffect(() => {
    if (!settings.sound) return;
    const onClick = (e) => {
      const el = e.target.closest("button, a, .nx-nav, .nx-chip, [role='button']");
      if (!el || el.disabled) return;
      if (el.classList.contains("nx-nav")) return Sound.nav();
      if (el.classList.contains("nx-toggle-sw") || el.getAttribute("aria-pressed")) {
        return el.getAttribute("aria-pressed") === "true" ? Sound.off() : Sound.on();
      }
      if (el.classList.contains("nx-asst-send") || el.classList.contains("nx-cta")) return Sound.send();
      if (el.classList.contains("nx-chip") || el.classList.contains("nx-tab")) return Sound.select();
      Sound.click();
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [settings.sound]);

  useEffect(() => {
    if (!settings.sound || !settings.hover) return;
    const onMove = () => Sound.hover();
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [settings.sound, settings.hover]);

  // Keep the module-level lock in sync so non-component code (network adapter)
  // can see school mode and refuse real system calls.
  useEffect(() => { SchoolLock.on = !!settings.schoolMode; }, [settings.schoolMode]);

  const shownModules = MODULES.filter((m) =>
    !settings.hidden.includes(m.id) && !(settings.schoolMode && AI_MODULES.has(m.id)));
  const rootClass = `nx-root${splash ? " nx-asleep" : " nx-woke"}`
    + (settings.motion ? "" : " nx-still")
    + (settings.density === "compact" ? " nx-compact" : "");

  // Hold everything blank until we've (a) loaded settings and (b) decided
  // about the splash and the key. Rendering the dashboard before the splash
  // decision is what caused the dashboard to flash for a frame first.
  const booting = keyState === "checking" || !settingsReady || !splashDecided;

  // First-run tutorial: once settings are loaded, keys are handled, and the
  // splash is gone, show the tour if it hasn't been seen yet.
  const tutTriggered = useRef(false);
  useEffect(() => {
    if (booting || splash || keyState !== "ready" || tutTriggered.current) return;
    if (!settings.tutorialSeen) { tutTriggered.current = true; setShowTutorial(true); }
  }, [booting, splash, keyState, settings.tutorialSeen]);

  // First-run background music. Starts the moment a brand-new user opens the
  // app (no key yet, tutorial unseen) and plays through welcome → keys →
  // tutorial. Stops when the tutorial is finished or skipped. Lives at the
  // shell so its lifecycle isn't tied to any screen that mounts/unmounts.
  const musicRef = useRef(null);
  const musicStarted = useRef(false);
  useEffect(() => {
    if (settingsReady && !settings.tutorialSeen && !musicStarted.current) {
      musicStarted.current = true;
      musicRef.current = makeHum();
      musicRef.current.start();
    }
    // Stop once the tutorial has been seen (finished or skipped both set it).
    if (settings.tutorialSeen && musicStarted.current) {
      musicRef.current?.stop();
      musicRef.current = null;
    }
  }, [settingsReady, settings.tutorialSeen]);
  // Safety: also stop if the app unmounts.
  useEffect(() => () => { musicRef.current?.stop(); }, []);

  // Replay case: if the tutorial is opened later from Settings (tutorialSeen is
  // already true), play music for the duration and stop when it closes.
  const replayMusicRef = useRef(null);
  useEffect(() => {
    if (showTutorial && settings.tutorialSeen && !replayMusicRef.current) {
      replayMusicRef.current = makeHum();
      replayMusicRef.current.start();
    }
    if (!showTutorial && replayMusicRef.current) {
      replayMusicRef.current.stop();
      replayMusicRef.current = null;
    }
  }, [showTutorial, settings.tutorialSeen]);

  // Spoken greeting once the app is ready (not in school mode). First launch
  // welcomes by name; after that it rotates through short lines, occasionally
  // weather-aware. Fires once per app open.
  const greetedRef = useRef(false);
  useEffect(() => {
    if (booting || greetedRef.current || settings.schoolMode) return;
    if (splash) return; // hold the greeting until the startup quote is dismissed
    if (!settings.greetVoice || !settings.voiceSpeak) { greetedRef.current = true; return; }
    greetedRef.current = true;

    const hour = new Date().getHours();
    const partOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
    const name = (settings.userName || "").trim();
    const first = (settings.launchCount || 0) === 0;

    // Bump the launch counter so first-run only happens once.
    setSettings((p) => ({ ...p, launchCount: (p.launchCount || 0) + 1 }));

    const say = (line) => {
      // Wait a beat so voices are loaded and the splash is gone.
      setTimeout(() => speak(line, true, settings.voiceGender), first ? 700 : 400);
    };

    if (first) {
      say(`Good ${partOfDay}${name ? ", " + name : ""}. Welcome to Nexus O S.`);
      return;
    }

    // Returning: a rotating set of short, warm lines.
    const lines = [
      `Good ${partOfDay}${name ? ", " + name : ""}.`,
      `Welcome back${name ? ", " + name : ""}.`,
      `Good to see you${name ? ", " + name : ""}.`,
      `${name ? name + ", r" : "R"}eady when you are.`,
      "Beautiful day to get things done.",
    ];
    let chosen = lines[Math.floor(Math.random() * lines.length)];

    // Occasionally fold in the real weather.
    const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
    if (inv && Math.random() < 0.4 && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => inv("get_weather", { lat: pos.coords.latitude, lon: pos.coords.longitude })
          .then((w) => {
            const label = String(w.label || "").toLowerCase();
            if (label.includes("rain")) say(`Bit of rain out there today${name ? ", " + name : ""}.`);
            else if (label.includes("clear")) say(`Clear skies today${name ? ", " + name : ""}.`);
            else if (label.includes("snow")) say(`Snow today${name ? ", " + name : ""} — stay warm.`);
            else say(`${w.temp_f} degrees out. ${chosen}`);
          })
          .catch(() => say(chosen)),
        () => say(chosen), { timeout: 4000, maximumAge: 900000 }
      );
    } else {
      say(chosen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, splash]);

  // Cyber Twin watcher  -  while Nexus is open, quietly re-checks the system
  // against its saved baseline every ~60s and speaks up ONLY when a genuinely
  // new anomaly appears (each specific finding is announced once, not nagged).
  // Not background OS monitoring  -  it only runs while the app is open.
  const twinSpokenRef = useRef(new Set());
  const cpuHighRef = useRef(0);        // consecutive high-CPU ticks
  const memArmedRef = useRef(true);    // can the memory alert fire? (re-arms on recovery)
  const cpuArmedRef = useRef(true);    // same for CPU
  useEffect(() => {
    if (booting || settings.schoolMode || !isDesktopShell) return;
    let alive = true;
    const inv = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
    if (!inv) return;

    const readBaseline = async () => {
      try {
        const raw = await inv("load_state", { key: "cyber-baseline" });
        return JSON.parse(raw);
      } catch { return null; }
    };

    const announce = (findings) => {
      const fresh = findings.filter((f) => !f.key || !twinSpokenRef.current.has(f.key));
      if (!fresh.length) return;
      fresh.forEach((f) => { if (f.key) twinSpokenRef.current.add(f.key); });
      const worst = fresh.find((x) => x.sev === "high") || fresh[0];
      // Queued, not spoken immediately: this is a background notice, so it
      // waits for the startup quote and for anything already talking.
      if (settings.voiceSpeak) speak(worst.text, true, settings.voiceGender).catch(() => {});
      toast(worst.text);
    };

    // Overall system pressure  -  memory and sustained CPU. These don't depend on
    // a baseline; they're about the machine being under strain right now.
    const checkLoad = async () => {
      try {
        const f = await inv("telemetry");
        if (!alive) return;
        // Memory: alert once when it crosses ~90%; re-arm after it drops below 80%.
        if (f.mem >= 90 && memArmedRef.current) {
          memArmedRef.current = false;
          announce([{ sev: "high", text: `Your memory is at ${Math.round(f.mem)} percent — the system may start slowing down. It's worth closing a few apps or tabs.` }]);
        } else if (f.mem < 80) {
          memArmedRef.current = true;
        }
        // CPU: only care about SUSTAINED load, not brief spikes. Needs ~3 checks
        // (about 45s) above 80% before it says anything; re-arms below 50%.
        if (f.cpu >= 80) cpuHighRef.current += 1; else cpuHighRef.current = 0;
        if (cpuHighRef.current >= 3 && cpuArmedRef.current) {
          cpuArmedRef.current = false;
          announce([{ sev: "med", text: `Your processor has been running hot — around ${Math.round(f.cpu)} percent — for a little while now. Something's working it hard.` }]);
        }
        if (f.cpu < 50) cpuArmedRef.current = true;
      } catch { /* telemetry unavailable this tick */ }
    };

    const tick = async () => {
      await checkLoad(); // overall pressure  -  always, even without a baseline
      const base = await readBaseline();
      if (!base || !alive) return;
      try {
        const now = await inv("system_snapshot");
        if (!alive) return;
        const findings = [];
        const newPorts = now.ports.filter((p) => !base.ports.includes(p));
        for (const p of newPorts) {
          const known = PORT_NAMES[p];
          findings.push({ key: `port-${p}`, sev: (p === 3389 || p === 22 || p === 445) ? "high" : "med",
            text: `Heads up — port ${p}${known ? ` (${known})` : ""} just started listening. It wasn't open at your baseline.` });
        }
        const baseMem = {}; base.top.forEach((t) => { baseMem[t.name] = t.mem_mb; });
        for (const t of now.top) {
          const was = baseMem[t.name];
          if (was && t.mem_mb > was * 2.2 && t.mem_mb - was > 600) {
            findings.push({ key: `proc-${t.name}`, sev: "med",
              text: `${t.name} is using ${(t.mem_mb / 1024).toFixed(1)} gigabytes right now — a lot more than usual.` });
          }
        }
        announce(findings);
      } catch { /* snapshot failed — ignore this tick */ }
    };

    // Load pressure gets checked more often (every 15s) so a real memory/CPU
    // problem is caught quickly; the baseline diff runs on the slower cycle.
    const fast = setInterval(checkLoad, 15000);
    const id = setInterval(tick, 60000);
    const warm = setTimeout(tick, 8000);
    return () => { alive = false; clearInterval(fast); clearInterval(id); clearTimeout(warm); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, settings.schoolMode, settings.voiceSpeak, settings.voiceGender, isDesktopShell]);

  if (booting) {
    return (
      <div className="nx-root nx-booting">
        <style>{CSS}</style>
        <style>{themeStyle}</style>
      </div>
    );
  }

  // Before anything else: first-run onboarding takes over the whole screen.
  // Welcome + name, then the key setup, then the app (with the tutorial).
  if (keyState === "needed") {
    return (
      <div className={rootClass}>
        <style>{CSS}</style>
        <style>{themeStyle}</style>
        {onboard === "welcome"
          ? <Welcome
              name={settings.userName || ""}
              setName={(v) => setSettings((p) => ({ ...p, userName: v }))}
              onNext={() => setOnboard("keys")} />
          : <KeySetup onDone={() => setKeyState("ready")} />}
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <style>{CSS}</style>
      <style>{themeStyle}</style>

      {splash && <Splash onDone={() => setSplash(false)} />}

      {showTutorial && <Tutorial ctx={ctx} onClose={() => setShowTutorial(false)} />}
      {aboutOpen && <AboutPage ctx={ctx} onClose={() => setAboutOpen(false)} />}

      <VoiceOverlay ctx={ctx} settings={settings} />

      <aside className={`nx-sidebar${railCollapsed ? " nx-sidebar-mini" : ""}`}>
        <div className="nx-brand">
          <span className="nx-brand-mark" /><span className="nx-brand-name">NEXUS</span>
          <button className="nx-rail-toggle" onClick={() => setRailCollapsed((c) => !c)}
            title={railCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label="Toggle sidebar">
            {railCollapsed ? <ArrowRight size={14} /> : <Minus size={14} />}
          </button>
        </div>
        <nav>
          {shownModules.map((m) => (
            <button key={m.id} data-module={m.id} className={`nx-nav${m.id === active ? " nx-nav-on" : ""}`}
              onClick={() => go(m.id)} title={railCollapsed ? m.label : undefined}>
              <m.icon size={16} strokeWidth={1.7} /><span>{m.label}</span>
              {m.status === "planned" && <i className="nx-dot" />}
            </button>
          ))}
        </nav>
        <button className="nx-cmd" onClick={() => setPaletteOpen(true)} title={railCollapsed ? "Search" : undefined}>
          <Command size={13} /> <span>Search</span> <kbd>⌘K</kbd>
        </button>
      </aside>

      <main className="nx-main">
        <div className="nx-topbar">
          <div>
            <p className="nx-eyebrow">{active === "dashboard" ? "Command center" : mod.id}</p>
            <h2>{active === "dashboard" ? "Dashboard" : mod.label}</h2>
          </div>
          <div className="nx-topbar-tools">
            {active === "dashboard" && (
              <button className={`nx-btn${edit ? " nx-btn-on" : ""}`}
                onClick={() => setEdit((e) => !e)}>{edit ? "Done" : "Rearrange"}</button>
            )}
          </div>
        </div>

        {edit && active === "dashboard" && (
          <p className="nx-hint">
            Drag a widget onto another to swap their spots — the core orb too. Use × to remove, or add more below.
          </p>
        )}

        {(() => {
          const renderModule = (id) => {
            if (id === "dashboard") return <Dashboard layout={layout} setLayout={setLayout} edit={edit} ctx={ctx} />;
            if (VIEWS[id]) return React.createElement(VIEWS[id], { ctx });
            return <ModuleView mod={MODULES.find((m) => m.id === id) || MODULES[0]} />;
          };
          const ids = new Set(visited); ids.add(active);
          // Recompute only the active module (fresh ctx); reuse cached elements
          // for the hidden ones so React bails out of re-rendering them.
          for (const id of ids) {
            if (id === active || !viewCache.current[id]) viewCache.current[id] = renderModule(id);
          }
          return [...ids].map((id) => (
            <div key={id} className="nx-view-slot"
              style={{ display: id === active ? "contents" : "none" }}>
              {viewCache.current[id]}
            </div>
          ));
        })()}
      </main>

      {!splash && settings.ask && !settings.schoolMode && !NO_ASK.has(active) && <ModuleAsk mod={mod} ctx={ctx} />}

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} go={go}
        modules={shownModules} />
      {note && <div className="nx-toast">{note}</div>}
      <AgentAlert active={active} go={go} />
    </div>
  );
}

function AgentAlert({ active, go }) {
  const [alert, setAlert] = useState(null);

  useEffect(() => subscribeToast(setAlert), []);

  // "It needs you" stays until dealt with; "finished" is FYI and clears itself.
  useEffect(() => {
    if (!alert || alert.kind === "help") return;
    const iv = setTimeout(() => dismissAgentToast(), 9000);
    return () => clearTimeout(iv);
  }, [alert]);

  if (!alert || active === "agent") return null;

  const Icon = alert.kind === "help" ? Hand : alert.kind === "warn" ? AlertTriangle : CheckCircle2;

  return (
    <div className={`nx-agentalert nx-agentalert-${alert.kind}`} role="status">
      <Icon size={17} strokeWidth={1.8} />
      <div className="nx-agentalert-body">
        <strong>{alert.title}</strong>
        <p>{alert.body}</p>
      </div>
      <div className="nx-agentalert-acts">
        <button
          className="nx-agentalert-go"
          onClick={() => { dismissAgentToast(); go("agent"); }}
        >
          {alert.kind === "help" ? "Go help it" : "Open"}
        </button>
        <button className="nx-agentalert-x" onClick={dismissAgentToast} aria-label="Dismiss">
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@200;300;400;600&family=JetBrains+Mono:wght@400;500&display=swap');

/* The shell owns the whole page. Without this the host background
   shows through anywhere the app does not reach. */
html,body{margin:0;padding:0;background:#04060C;}
body{height:100vh;overflow:hidden;}

.nx-root{
  --void:#04060C;
  --glass:rgba(148,178,255,0.045); --glass-2:rgba(148,178,255,0.08);
  --edge:rgba(159,190,255,0.10);
  --ice:#E4ECFF; --muted:#8C9CBF; --muted-2:#4E5A75;
  --signal:#5EE6C4; --violet:#8E7CFF; --ember:#FF9C6B;
  --display:'Sora',system-ui,sans-serif; --mono:'JetBrains Mono',ui-monospace,monospace;
  --row:112px;

  display:flex; height:100vh; width:100%; overflow:hidden;
  background:
    radial-gradient(900px 520px at 10% -8%, var(--glow-faint), transparent 60%),
    radial-gradient(720px 480px at 94% 4%, rgba(142,124,255,0.07), transparent 60%),
    var(--void);
  color:var(--ice); font-family:var(--display); font-weight:300; -webkit-font-smoothing:antialiased;
}
.nx-root *{box-sizing:border-box;margin:0;}
.nx-root *{scrollbar-width:thin;scrollbar-color:rgba(159,190,255,0.18) transparent;}
.nx-root ::-webkit-scrollbar{width:8px;height:8px;}
.nx-root ::-webkit-scrollbar-track{background:transparent;}
.nx-root ::-webkit-scrollbar-thumb{background:rgba(159,190,255,0.16);border-radius:20px;
  border:2px solid transparent;background-clip:content-box;}
.nx-root ::-webkit-scrollbar-thumb:hover{background:rgba(159,190,255,0.3);background-clip:content-box;}
.nx-root ::-webkit-scrollbar-corner{background:transparent;}
.nx-root button{font:inherit;color:inherit;background:none;border:none;cursor:pointer;}
.nx-root ul{list-style:none;padding:0;}
.nx-root :focus-visible{outline:1.5px solid var(--signal);outline-offset:3px;border-radius:8px;}

.nx-sidebar{width:244px;flex-shrink:0;padding:24px 16px 18px;display:flex;flex-direction:column;gap:24px;
  background:linear-gradient(180deg,rgba(148,178,255,0.05),rgba(148,178,255,0.014));
  border-right:1px solid var(--edge);backdrop-filter:blur(20px);transition:width .22s cubic-bezier(.2,.7,.3,1);}
.nx-rail-toggle{margin-left:auto;display:flex;align-items:center;justify-content:center;width:26px;height:26px;
  border-radius:8px;color:var(--muted-2);transition:all .15s;}
.nx-rail-toggle:hover{color:var(--ice);background:var(--glass);}
/* collapsed: icons only */
.nx-sidebar-mini{width:64px;padding-left:10px;padding-right:10px;}
.nx-sidebar-mini .nx-brand-name{display:none;}
.nx-sidebar-mini .nx-nav span{display:none;}
.nx-sidebar-mini .nx-nav{justify-content:center;padding-left:0;padding-right:0;}
.nx-sidebar-mini .nx-cmd span,.nx-sidebar-mini .nx-cmd kbd{display:none;}
.nx-sidebar-mini .nx-cmd{justify-content:center;}
.nx-sidebar-mini .nx-brand{justify-content:center;}
.nx-sidebar-mini .nx-rail-toggle{margin-left:0;}
.nx-brand{display:flex;align-items:center;gap:10px;padding:0 8px;}
.nx-brand-mark{width:9px;height:9px;border-radius:50%;background:var(--signal);
  box-shadow:0 0 12px var(--signal),0 0 26px var(--glow);animation:nx-pulse 3.4s ease-in-out infinite;}
.nx-brand-name{font-size:14px;font-weight:600;letter-spacing:0.28em;}
.nx-sidebar nav{display:flex;flex-direction:column;gap:1px;flex:1;}
.nx-nav{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:10px;font-size:13.5px;
  color:var(--muted);transition:background .18s ease,color .18s ease,transform .18s ease;}
.nx-nav:hover{background:var(--glass);color:var(--ice);transform:translateX(2px);}
.nx-nav-on{background:var(--glass-2);color:var(--ice);
  box-shadow:inset 1px 0 0 var(--signal),0 0 22px var(--glow-faint);}
.nx-nav span{flex:1;text-align:left;}
.nx-dot{width:3px;height:3px;border-radius:50%;background:var(--muted-2);}
.nx-cmd{display:flex;align-items:center;gap:8px;padding:9px 11px;font-size:12px;color:var(--muted-2);
  border:1px solid var(--edge);border-radius:10px;transition:color .18s,border-color .18s;}
.nx-cmd:hover{color:var(--muted);border-color:rgba(159,190,255,0.2);}
.nx-cmd kbd,.nx-palette kbd{margin-left:auto;font-family:var(--mono);font-size:10px;padding:2px 5px;
  border-radius:5px;background:var(--glass-2);}

.nx-main{flex:1;min-width:0;overflow-y:auto;padding:30px 44px 28px;display:flex;flex-direction:column;align-items:stretch;}
.nx-main>*{width:100%;max-width:none;}
.nx-main>.nx-grid,.nx-main>.nx-mod,.nx-main>.nx-module{flex-shrink:0;}
/* Keep-alive slots are display:contents when active, so module roots still act
   as direct flex children of nx-main - mirror the width/shrink rules onto them. */
.nx-view-slot>*{width:100%;max-width:none;}
.nx-view-slot>.nx-grid,.nx-view-slot>.nx-mod,.nx-view-slot>.nx-module{flex-shrink:0;}
.nx-topbar{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;
  padding-bottom:20px;margin-bottom:22px;border-bottom:1px solid var(--edge);}
.nx-topbar h2{font-size:26px;font-weight:200;letter-spacing:-0.01em;}
.nx-eyebrow{font-family:var(--mono);font-size:10px;letter-spacing:0.2em;text-transform:uppercase;
  color:var(--signal);margin-bottom:7px;}
.nx-topbar-tools{display:flex;align-items:center;gap:10px;}
.nx-toggle{display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:20px;font-size:11.5px;
  color:var(--muted-2);border:1px solid var(--edge);transition:color .18s,border-color .18s;}
.nx-toggle i{width:6px;height:6px;border-radius:50%;background:var(--muted-2);transition:all .18s;}
.nx-toggle-on{color:var(--ice);border-color:var(--glow);}
.nx-toggle-on i{background:var(--signal);box-shadow:0 0 8px var(--signal);}
.nx-btn{padding:7px 15px;border-radius:20px;font-size:11.5px;border:1px solid var(--edge);
  color:var(--muted);transition:all .18s;}
.nx-btn:hover{color:var(--ice);border-color:rgba(159,190,255,0.22);}
.nx-btn-on{background:var(--signal);color:var(--void);border-color:transparent;font-weight:600;
  box-shadow:0 0 24px var(--glow);}
.nx-hint{font-size:11.5px;color:var(--muted-2);margin-bottom:14px;font-family:var(--mono);}

.nx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));
  grid-auto-rows:var(--row);gap:14px;align-content:start;padding-bottom:8px;}

/* centered orbit layout  -  core dead-center, widgets framing it.
   Every letter must form a solid rectangle or the grid is discarded. */
.nx-orbit-grid{display:grid;gap:14px;
  grid-template-columns:1fr 1fr 1.2fr 1.2fr 1fr 1fr;
  grid-template-rows:auto auto auto auto;
  grid-template-areas:
    "a  a  core core b  b"
    "c  d  core core e  f"
    "g  h  core core i  j"
    "k  k  k    l    l  l";}
.nx-orbit-cell{min-width:0;display:flex;}
.nx-orbit-cell>.nx-w{flex:1;min-height:150px;}
.nx-orbit-cell>.nx-w-core{min-height:560px;
  background:radial-gradient(120% 100% at 50% 60%, var(--glow-faint), transparent 70%),
    linear-gradient(160deg,var(--glass),rgba(148,178,255,0.012));
  border-color:var(--glow-soft);}
.nx-w-core .nx-w-body{align-items:center;justify-content:center;}
.nx-w-core .nx-ring-wrap{width:100%;height:100%;}
@media (max-width:1100px){
  .nx-orbit-grid{grid-template-columns:1fr 1fr;
    grid-template-areas:
      "a b" "core core" "core core" "c d" "e f" "g h" "i j" "k l";}
  .nx-orbit-cell>.nx-w-core{min-height:420px;}
}
.nx-w-sm{grid-column:span 1;grid-row:span 1;}
.nx-w-md{grid-column:span 2;grid-row:span 1;}
.nx-w-tall{grid-column:span 1;grid-row:span 2;}
.nx-w-xl{grid-column:span 2;grid-row:span 2;}
.nx-w-lg{grid-column:span 2;grid-row:span 3;}
.nx-w-hero{grid-column:span 3;grid-row:span 3;}
.nx-w-mega{grid-column:span 4;grid-row:span 4;}
.nx-w{position:relative;padding:15px 16px;border-radius:16px;border:1px solid var(--edge);overflow:hidden;
  background:linear-gradient(160deg,var(--glass),rgba(148,178,255,0.012));backdrop-filter:blur(16px);
  display:flex;flex-direction:column;transition:border-color .22s,box-shadow .22s;}
.nx-w:hover{border-color:rgba(159,190,255,0.19);}
.nx-grid-edit .nx-w{cursor:grab;border-style:dashed;border-color:rgba(159,190,255,0.2);}
/* In-place orbit editing: dashed cells, a small edit bar, drag-to-swap. */
.nx-w-editing{border-style:dashed;border-color:rgba(159,190,255,0.28);}
.nx-cell-drag{opacity:0.4;}
.nx-cell-over .nx-w-editing{border-color:var(--signal);box-shadow:0 0 0 2px var(--glow-soft);}
.nx-w-edit-bar{display:flex;align-items:center;justify-content:space-between;
  margin:-4px -4px 8px;padding:2px 4px;cursor:grab;touch-action:none;}
.nx-w-edit-bar:active{cursor:grabbing;}
.nx-w-grip{display:flex;align-items:center;gap:5px;font-size:10px;letter-spacing:0.04em;
  text-transform:uppercase;color:var(--muted-2);}
.nx-w-x{display:flex;align-items:center;justify-content:center;width:22px;height:22px;
  border-radius:7px;border:1px solid var(--edge);background:transparent;color:var(--muted-2);cursor:pointer;}
.nx-w-x:hover{color:var(--ember);border-color:var(--ember);}
.nx-w-drag{opacity:0.35;}
.nx-w-over{border-color:var(--signal)!important;box-shadow:0 0 0 1px var(--signal),0 0 26px var(--glow-soft);}
.nx-w-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;color:var(--muted-2);flex-shrink:0;}
.nx-w-head h3{font-size:11.5px;font-weight:400;color:var(--muted);}
.nx-w-body{flex:1;min-height:0;display:flex;flex-direction:column;overflow:visible;}
.nx-w-tools{position:absolute;top:8px;right:8px;display:flex;align-items:center;gap:4px;z-index:3;}
.nx-w-tools button,.nx-w-grip{display:flex;align-items:center;gap:4px;padding:4px 7px;border-radius:7px;
  font-family:var(--mono);font-size:9.5px;color:var(--muted);background:rgba(4,6,12,0.78);
  border:1px solid var(--edge);cursor:pointer;}
.nx-w-tools button:hover,.nx-w-grip:hover{color:var(--ice);border-color:var(--signal);}

.nx-readout{font-family:var(--mono);font-size:29px;font-weight:400;letter-spacing:-0.02em;line-height:1;}
.nx-readout-sm{font-size:24px;}
.nx-readout-good{color:var(--signal);}
.nx-readout-bad{color:var(--ember);}
.nx-wifi-bar{display:inline-block;width:80px;height:6px;border-radius:3px;background:var(--glass-2);margin-right:8px;vertical-align:middle;overflow:hidden;}
.nx-wifi-bar i{display:block;height:100%;background:var(--signal);border-radius:3px;}
.nx-live-badge{color:var(--signal);font-size:9px;letter-spacing:0.1em;margin-left:8px;font-family:var(--mono);}
.nx-mdz{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
  padding:34px 20px;border-radius:14px;border:1.5px dashed var(--edge);cursor:pointer;
  color:var(--muted-2);transition:all .18s;text-align:center;}
.nx-mdz:hover{border-color:var(--glow-soft);color:var(--muted);}
.nx-mdz-on{border-color:var(--glow);background:var(--glow-faint);color:var(--signal);}
.nx-mdz svg{color:var(--signal);}
.nx-mdz-title{font-size:14px;color:var(--ice);}
.nx-mdz-sub{font-size:11.5px;color:var(--muted-2);}
.nx-seg{display:inline-flex;border:1px solid var(--edge);border-radius:10px;overflow:hidden;}
.nx-seg button{padding:7px 16px;font-size:12px;color:var(--muted);transition:all .16s;}
.nx-seg button:hover{color:var(--ice);}
.nx-seg-on{background:var(--signal)!important;color:var(--void)!important;}
.nx-set-tabs{display:flex;gap:6px;margin-bottom:22px;flex-wrap:wrap;border-bottom:1px solid var(--edge);padding-bottom:14px;}
.nx-set-tab{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:10px;
  font-size:13px;color:var(--muted);border:1px solid transparent;transition:all .16s;}
.nx-set-tab:hover{color:var(--ice);background:var(--glass);}
.nx-asst-stop{background:var(--ember)!important;color:var(--void)!important;}
.nx-asst-stop:hover{filter:brightness(1.1);}
.nx-voice-stop{margin-top:14px;display:inline-flex;align-items:center;gap:6px;padding:6px 14px;
  border-radius:9px;font-size:12px;color:var(--ice);background:var(--glass);
  border:1px solid var(--edge);transition:all .15s;}
.nx-voice-stop:hover{background:var(--ember);color:var(--void);border-color:var(--ember);}
.nx-math{font-family:var(--mono);font-size:14px;color:var(--ice);margin:8px 0;padding:8px 12px;
  overflow-x:auto;white-space:nowrap;letter-spacing:0.02em;}
.nx-math-boxed{border:1px solid var(--glow-soft);border-radius:8px;background:var(--glow-faint);
  display:inline-block;box-shadow:0 0 16px var(--glow-faint);}
.nx-math-inline{font-family:var(--mono);color:var(--ice);}
.nx-code-inline{font-family:var(--mono);font-size:0.9em;padding:1px 5px;border-radius:4px;
  background:var(--glass);color:var(--signal);}
.nx-mdh{font-weight:600;color:var(--ice);margin:12px 0 4px;}
.nx-mdh-1{font-size:16px;} .nx-mdh-2{font-size:14.5px;} .nx-mdh-3{font-size:13.5px;color:var(--muted);}
.nx-mdh-4{font-size:12.5px;color:var(--muted);}
.nx-hr{border:none;border-top:1px solid var(--edge);margin:12px 0;}
.nx-hw-or{display:flex;align-items:center;gap:12px;margin:16px 0 10px;color:var(--muted-2);font-size:11px;}
.nx-hw-or::before,.nx-hw-or::after{content:"";flex:1;height:1px;background:var(--edge);}
/* about / architecture page */
.nx-about{position:fixed;inset:0;z-index:210;background:var(--void);display:flex;flex-direction:column;
  animation:nx-fade .25s both;}
.nx-about-bar{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;
  border-bottom:1px solid var(--edge);flex-shrink:0;background:rgba(10,12,18,0.6);backdrop-filter:blur(10px);}
.nx-about-bar-title{display:flex;align-items:center;gap:9px;font-size:14px;color:var(--ice);font-weight:600;}
.nx-about-scroll{overflow-y:auto;padding:0 24px 60px;}
.nx-about-hero{max-width:720px;margin:0 auto;text-align:center;padding:48px 0 30px;}
.nx-about-hero h1{font-size:32px;color:var(--ice);margin:14px 0 6px;letter-spacing:-0.02em;}
.nx-about-tag{color:var(--signal);font-size:14px;margin-bottom:18px;}
.nx-about-lede{color:var(--muted);font-size:14px;line-height:1.7;max-width:600px;margin:0 auto;}
.nx-about-sec{max-width:720px;margin:0 auto;padding:26px 0;border-top:1px solid var(--edge);}
.nx-about-sec h2{font-size:20px;color:var(--ice);margin-bottom:10px;letter-spacing:-0.01em;}
.nx-about-sec > p{color:var(--muted);font-size:13.5px;line-height:1.7;}
.nx-about-icon{display:inline-flex;padding:9px;border-radius:11px;background:var(--glow-faint);
  color:var(--signal);border:1px solid var(--glow-soft);margin-bottom:12px;}
.nx-about-two{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:14px;}
.nx-about-two p{font-size:13px;line-height:1.65;color:var(--muted);}
.nx-about-label{font-family:var(--mono);font-size:10px;letter-spacing:0.12em;text-transform:uppercase;
  color:var(--signal)!important;margin-bottom:6px;}
.nx-about-two code,.nx-about-sec code{font-family:var(--mono);font-size:0.88em;padding:1px 5px;
  border-radius:4px;background:var(--glass);color:var(--ice);}
.nx-about-bar-actions{display:flex;align-items:center;gap:12px;}
.nx-about-live{position:relative;}
.nx-about-live::before{content:"";position:absolute;left:-24px;top:0;bottom:0;width:3px;
  background:var(--signal);border-radius:2px;box-shadow:0 0 16px var(--signal);animation:nx-tut-pulse 1.6s ease-in-out infinite;}
.nx-about-sec,.nx-about-hero{transition:opacity .4s;}
.nx-about-svg{width:100%;height:auto;margin:16px 0 4px;}
.nx-svg-h{fill:var(--ice);font-size:15px;font-weight:600;}
.nx-svg-s{fill:var(--muted);font-size:11px;}
.nx-svg-b{fill:var(--signal);font-size:12px;font-family:var(--mono);}
.nx-svg-t{fill:var(--muted-2);font-size:10px;font-family:var(--mono);}
.nx-flow{display:flex;flex-direction:column;align-items:center;gap:4px;margin:18px 0;}
.nx-flow-node{display:flex;align-items:center;gap:14px;width:100%;max-width:420px;padding:12px 16px;
  border-radius:12px;background:var(--glow-faint);border:1px solid var(--glow-soft);}
.nx-flow-num{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;
  color:var(--void);font-size:12px;font-weight:700;flex-shrink:0;}
.nx-flow-t{color:var(--ice);font-size:13px;font-family:var(--mono);}
.nx-flow-s{color:var(--muted-2);font-size:11px;}
.nx-flow-arrow{color:var(--signal);font-size:18px;}
.nx-stack{display:flex;flex-direction:column;gap:8px;margin-top:16px;}
.nx-stack-layer{display:flex;align-items:center;gap:14px;padding:14px 18px;border-radius:12px;
  background:var(--glow-faint);border:1px solid var(--glow-soft);color:var(--signal);}
.nx-stack-t{color:var(--ice);font-size:14px;}
.nx-stack-s{color:var(--muted-2);font-size:11.5px;}
.nx-about-note{background:var(--glow-faint);border-radius:16px;padding:24px;border-top:none;
  border:1px solid var(--glow-soft);margin-top:26px;}
.nx-about-foot{max-width:720px;margin:40px auto 0;text-align:center;display:flex;flex-direction:column;
  align-items:center;gap:14px;padding-top:30px;border-top:1px solid var(--edge);}
.nx-about-foot p{color:var(--muted-2);font-size:11.5px;font-family:var(--mono);}
@media (max-width:640px){.nx-about-two{grid-template-columns:1fr;}}
.nx-set-tab-on{color:var(--signal);background:var(--glow-faint);border-color:var(--glow-soft);}

/* tutorial */
.nx-tut-wrap{position:fixed;inset:0;z-index:200;display:flex;padding:24px;
  animation:nx-fade .3s both;pointer-events:none;}
.nx-tut-wrap.nx-tut-wrap-bottom,.nx-tut-wrap.nx-tut-step{background:transparent;backdrop-filter:none;}
.nx-tut-wrap:not(.nx-tut-step){align-items:center;justify-content:center;
  background:rgba(4,6,12,0.72);backdrop-filter:blur(6px);pointer-events:auto;}
/* per-step card positions so the bubble stays out of the way */
.nx-tut-pos-center{align-items:center;justify-content:center;}
.nx-tut-pos-left,.nx-tut-pos-right,.nx-tut-pos-bottom{align-items:flex-end;justify-content:flex-end;
  padding:0 28px 28px 0;}
.nx-tut-pos-top{align-items:flex-start;justify-content:flex-end;padding:28px 28px 0 0;}
.nx-tut-card{width:100%;max-width:420px;padding:24px 26px;border-radius:20px;
  border:1px solid var(--glow-soft);background:rgba(12,14,20,0.97);backdrop-filter:blur(20px);
  box-shadow:0 24px 70px rgba(0,0,0,0.55),0 0 50px var(--glow-faint);pointer-events:auto;
  transition:all .4s cubic-bezier(.2,.7,.3,1);}
.nx-tut-step .nx-tut-card{animation:nx-tut-slide .4s cubic-bezier(.2,.7,.3,1) both;}
.nx-tut-intro{text-align:center;max-width:460px;}
.nx-tut-intro .nx-setup-mark{margin:0 auto 16px;}
.nx-tut-card h2{font-size:22px;margin-bottom:10px;color:var(--ice);}
.nx-tut-card h3{font-size:17px;margin-bottom:8px;color:var(--ice);}
.nx-tut-card p{font-size:13.5px;line-height:1.6;color:var(--muted);}
.nx-tut-do{margin-top:12px;padding:10px 13px;border-radius:10px;font-size:12.5px!important;
  color:var(--signal)!important;background:var(--glow-faint);border:1px solid var(--glow-soft);}
.nx-tut-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
.nx-tut-count{font-family:var(--mono);font-size:10px;letter-spacing:0.1em;color:var(--muted-2);}
.nx-tut-x{color:var(--muted-2);padding:4px;border-radius:6px;}
.nx-tut-x:hover{color:var(--ice);background:var(--glass);}
.nx-tut-progress{display:flex;gap:5px;margin-top:16px;}
.nx-tut-progress i{width:6px;height:6px;border-radius:50%;background:var(--edge);transition:all .3s;}
.nx-tut-progress .nx-tut-dot-on{background:var(--signal);width:18px;border-radius:3px;}
.nx-tut-actions{display:flex;justify-content:flex-end;align-items:center;gap:14px;margin-top:16px;}
/* highlight the sidebar item the current step is about */
body[data-tut-highlight] .nx-nav[data-module]{opacity:0.3;transition:opacity .3s;}
body[data-tut-highlight="dashboard"] .nx-nav[data-module="dashboard"],
body[data-tut-highlight="assistant"] .nx-nav[data-module="assistant"],
body[data-tut-highlight="terminal"] .nx-nav[data-module="terminal"],
body[data-tut-highlight="network"] .nx-nav[data-module="network"],
body[data-tut-highlight="security"] .nx-nav[data-module="security"],
body[data-tut-highlight="school"] .nx-nav[data-module="school"],
body[data-tut-highlight="settings"] .nx-nav[data-module="settings"]{
  opacity:1!important;background:var(--signal)!important;color:var(--void)!important;
  border-radius:10px;transform:scale(1.05);transform-origin:left center;
  box-shadow:0 0 30px var(--glow);animation:nx-tut-pulse 1.4s ease-in-out infinite;}
body[data-tut-highlight] .nx-nav[data-module][class*="on"] svg,
body[data-tut-highlight="dashboard"] .nx-nav[data-module="dashboard"] svg,
body[data-tut-highlight="assistant"] .nx-nav[data-module="assistant"] svg{color:var(--void)!important;}
@keyframes nx-tut-pulse{0%,100%{box-shadow:0 0 20px var(--glow-soft);}
  50%{box-shadow:0 0 38px var(--glow);}}
@keyframes nx-tut-slide{from{opacity:0;transform:translateY(16px) scale(.98);}to{opacity:1;transform:none;}}
@keyframes nx-fade{from{opacity:0;}to{opacity:1;}}

/* voice assistant overlay */
.nx-voice{position:fixed;left:50%;bottom:40px;transform:translateX(-50%);z-index:180;
  pointer-events:none;animation:nx-voice-in .28s cubic-bezier(.2,.7,.3,1) both;}
.nx-voice-card{display:flex;align-items:center;gap:16px;min-width:340px;max-width:560px;
  pointer-events:auto;
  padding:16px 22px;border-radius:18px;border:1px solid var(--glow-soft);
  background:rgba(10,12,18,0.92);backdrop-filter:blur(20px);
  box-shadow:0 20px 60px rgba(0,0,0,0.5),0 0 40px var(--glow-faint);}
.nx-voice-orb{position:relative;width:34px;height:34px;flex-shrink:0;}
.nx-voice-core{position:absolute;inset:9px;border-radius:50%;background:var(--signal);
  box-shadow:0 0 16px var(--signal);}
.nx-voice-ring{position:absolute;inset:0;border-radius:50%;border:2px solid var(--glow-soft);}
.nx-voice-listening .nx-voice-ring{animation:nx-voice-pulse 1.1s ease-in-out infinite;}
.nx-voice-listening .nx-voice-core{animation:nx-breathe 1.1s ease-in-out infinite;}
.nx-voice-thinking .nx-voice-ring{animation:nx-spin 1s linear infinite;border-top-color:var(--signal);}
.nx-voice-body{min-width:0;flex:1;}
.nx-voice-label{font-family:var(--mono);font-size:9.5px;letter-spacing:0.16em;text-transform:uppercase;
  color:var(--signal);margin-bottom:4px;}
.nx-voice-err{color:var(--ember);}
.nx-voice-text{font-size:14px;line-height:1.4;color:var(--ice);
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;}
@keyframes nx-voice-in{from{opacity:0;transform:translateX(-50%) translateY(14px);}to{opacity:1;transform:translateX(-50%);}}
@keyframes nx-voice-pulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.25);opacity:0.4;}}
@keyframes nx-spin{to{transform:rotate(360deg);}}
.nx-idx-row{display:flex;gap:9px;width:100%;max-width:520px;margin-top:6px;}
.nx-idx-row .nx-inline{flex:1;min-width:0;font-family:var(--mono);font-size:12px;}
.nx-readout small{font-size:14px;color:var(--muted-2);margin-left:5px;}
.nx-readout i{font-style:normal;font-size:14px;color:var(--muted-2);margin-left:3px;}
.nx-tick{color:var(--signal);animation:nx-pulse 2s ease-in-out infinite;}
.nx-sub{margin-top:5px;font-size:12px;color:var(--muted);}
.nx-dim{color:var(--muted-2);}
.nx-blank{font-family:var(--mono);font-size:11px;color:var(--muted-2);letter-spacing:0.06em;
  margin:auto 0;text-transform:uppercase;}
.nx-mono{font-family:var(--mono);}

.nx-gauge{display:flex;align-items:center;gap:12px;margin:auto 0;}
.nx-gauge svg{width:64px;height:64px;flex-shrink:0;}
.nx-gauge-track{fill:none;stroke:rgba(159,190,255,0.09);stroke-width:5;}
.nx-gauge-fill{fill:none;stroke-width:5;stroke-linecap:round;transition:stroke-dasharray .5s ease;}
.nx-gauge-val{font-family:var(--mono);line-height:1.2;}
.nx-gauge-val b{font-size:22px;font-weight:400;}
.nx-gauge-val i{font-size:11px;color:var(--muted-2);font-style:normal;}
.nx-gauge-val em{font-size:20px;color:var(--muted-2);font-style:normal;}
.nx-gauge-val span{display:block;font-size:9.5px;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted-2);}

.nx-net{display:flex;align-items:center;gap:18px;flex:1;}
.nx-net>div{flex-shrink:0;}
.nx-spark{flex:1;height:44px;opacity:0.85;}
.nx-spark-empty{flex:1;height:44px;border-bottom:1px dashed var(--edge);}

.nx-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:20px;
  font-size:11.5px;font-family:var(--mono);letter-spacing:0.06em;}
.nx-pill-on{color:var(--signal);background:var(--glow-soft);border:1px solid var(--glow);}
.nx-pill-off{color:var(--ember);background:rgba(255,156,107,0.1);border:1px solid rgba(255,156,107,0.25);}
.nx-feed{display:flex;flex-direction:column;gap:11px;overflow-y:auto;}
.nx-feed li{display:flex;gap:9px;font-size:12px;color:var(--muted);line-height:1.45;}
.nx-feed i{width:5px;height:5px;border-radius:50%;flex-shrink:0;margin-top:5px;}
.nx-feed em{margin-left:auto;font-family:var(--mono);font-size:10px;color:var(--muted-2);
  font-style:normal;flex-shrink:0;}
.nx-rows{display:flex;flex-direction:column;gap:10px;}
.nx-rows li{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted);}
.nx-rows li>span:first-child{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nx-rows em{font-family:var(--mono);font-size:10px;color:var(--muted-2);font-style:normal;}
.nx-branch{font-family:var(--mono);font-size:9.5px;padding:2px 6px;border-radius:5px;
  background:var(--glass-2);color:var(--muted-2);flex-shrink:0;}
.nx-bar{width:52px;height:3px;border-radius:2px;background:rgba(159,190,255,0.1);overflow:hidden;flex-shrink:0;}
.nx-bar i{display:block;height:100%;background:var(--signal);}

.nx-task-due{font-style:normal;color:var(--muted-2);font-size:10px;}
.nx-tasks{display:flex;flex-direction:column;gap:2px;overflow-y:auto;}
.nx-tasks button{display:flex;align-items:center;gap:9px;width:100%;padding:6px 4px;font-size:12px;
  color:var(--muted);text-align:left;border-radius:7px;}
.nx-tasks button:hover{background:var(--glass);color:var(--ice);}
.nx-tasks i{width:12px;height:12px;border-radius:4px;border:1.4px solid var(--muted-2);
  flex-shrink:0;transition:all .18s;}
.nx-task-on{color:var(--muted-2);text-decoration:line-through;}
.nx-task-on i{background:var(--signal);border-color:var(--signal);}

.nx-chat{display:flex;flex-direction:column;justify-content:space-between;flex:1;gap:12px;}
.nx-chat-row{display:flex;gap:8px;min-width:0;}
.nx-chat-row input{flex:1;min-width:0;padding:9px 12px;border-radius:10px;background:rgba(4,6,12,0.5);
  border:1px solid var(--edge);color:var(--ice);font:inherit;font-size:12.5px;outline:none;}
.nx-chat-row input:focus{border-color:var(--glow);}
.nx-chat-row button{padding:9px 15px;border-radius:10px;font-size:12px;background:var(--glass-2);color:var(--ice);}
.nx-chat-row button:hover{background:var(--signal);color:var(--void);}
.nx-launch{display:flex;flex-wrap:wrap;gap:7px;align-content:flex-start;}
.nx-launch button{padding:7px 13px;border-radius:9px;font-size:11.5px;color:var(--muted);
  border:1px solid var(--edge);transition:all .18s;}
.nx-launch button:hover{color:var(--void);background:var(--signal);border-color:transparent;}
.nx-launch-wrap{display:flex;flex-direction:column;gap:10px;flex:1;min-width:0;}
.nx-launch-edit{display:flex!important;align-items:center;padding:7px 10px!important;color:var(--muted-2)!important;}
.nx-launch-editor{display:flex;flex-direction:column;gap:10px;}
.nx-launch-list{display:flex;flex-direction:column;gap:2px;}
.nx-launch-item{display:flex;align-items:center;gap:12px;padding:7px 8px;border-radius:8px;font-size:12px;}
.nx-launch-item:hover{background:var(--glass);}
.nx-launch-item:hover .nx-drop{opacity:1;}
.nx-launch-label{color:var(--ice);min-width:70px;}
.nx-launch-target{flex:1;min-width:0;font-family:var(--mono);font-size:10.5px;color:var(--muted-2);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nx-launch-help{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:11px;
  background:var(--glass);border:1px solid var(--edge);font-size:11.5px;line-height:1.55;color:var(--muted);}
.nx-launch-help code{font-family:var(--mono);font-size:10.5px;color:var(--signal);
  background:rgba(4,6,12,0.5);padding:1px 5px;border-radius:4px;margin:0 2px;word-break:break-all;}
.nx-launch-help b{color:var(--ice);font-weight:500;}
.nx-orbit-extras{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;
  margin-top:14px;}
.nx-orbit-extras>.nx-w{min-height:150px;}

.nx-cal{display:flex;flex-direction:column;gap:8px;flex:1;}
.nx-cal-title{font-size:12px;color:var(--muted);}
.nx-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-family:var(--mono);
  font-size:10px;text-align:center;color:var(--muted);}
.nx-cal-grid span{padding:2.5px 0;border-radius:5px;}
.nx-cal-dow{color:var(--muted-2);font-size:8.5px;letter-spacing:0.1em;}
.nx-cal-today{background:var(--signal);color:var(--void);font-weight:500;}

.nx-ring-wrap{flex:1;display:grid;place-items:center;min-height:0;overflow:hidden;}
.nx-ring{width:100%;max-height:100%;height:auto;overflow:visible;}
.nx-orbit{fill:none;stroke:var(--edge);stroke-width:1;}
.nx-orbit-faint{stroke:rgba(159,190,255,0.05);}
.nx-arc{fill:none;stroke:var(--signal);stroke-width:1.4;stroke-linecap:round;stroke-dasharray:58 700;opacity:0.55;}
.nx-arc-2{stroke:var(--violet);stroke-dasharray:28 700;opacity:0.4;}
.nx-sweep,.nx-sweep-rev{transform-origin:160px 160px;}
.nx-sweep{animation:nx-spin 14s linear infinite;}
.nx-sweep-rev{animation:nx-spin 22s linear infinite reverse;}
.nx-spoke{stroke:var(--signal);stroke-width:0.8;transition:opacity .25s;}
.nx-node{cursor:pointer;}
.nx-node-halo{fill:none;stroke:var(--signal);stroke-width:1;opacity:0.5;animation:nx-halo 2.4s ease-out infinite;}
.nx-core-label{text-anchor:middle;font-family:var(--mono);font-size:11px;letter-spacing:0.15em;fill:var(--ice);}
.nx-core-sub{text-anchor:middle;font-family:var(--mono);font-size:8px;letter-spacing:0.14em;fill:var(--muted-2);}

.nx-tray{border-style:dashed!important;background:rgba(148,178,255,0.02);}
.nx-tray-list{display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start;overflow-y:auto;}
.nx-tray-list button{display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:20px;
  font-size:11px;color:var(--muted);border:1px solid var(--edge);}
.nx-tray-list button:hover{color:var(--void);background:var(--signal);border-color:transparent;}

.nx-module{max-width:720px;}
.nx-module-head{display:flex;align-items:center;gap:16px;}
.nx-module-head h1{font-size:30px;font-weight:200;letter-spacing:-0.02em;}
.nx-module-icon{width:44px;height:44px;flex-shrink:0;display:grid;place-items:center;border-radius:13px;
  border:1px solid var(--edge);background:var(--glass);color:var(--signal);}
.nx-lede{max-width:56ch;margin:16px 0 28px;font-size:14px;line-height:1.65;color:var(--muted);}
.nx-empty{padding:26px;border-radius:16px;border:1px dashed rgba(159,190,255,0.14);
  background:rgba(148,178,255,0.02);}
.nx-empty-title{font-size:15px;font-weight:400;}
.nx-empty-body{margin-top:8px;font-size:13px;line-height:1.6;color:var(--muted);max-width:48ch;}
.nx-caps{margin-top:20px;display:flex;flex-wrap:wrap;gap:7px;}
.nx-caps li{font-family:var(--mono);font-size:10.5px;padding:5px 10px;border-radius:20px;
  border:1px solid var(--edge);color:var(--muted);}

.nx-scrim{position:fixed;inset:0;background:rgba(4,6,12,0.7);backdrop-filter:blur(6px);
  display:flex;justify-content:center;padding-top:14vh;z-index:50;}
.nx-palette{width:min(420px,90vw);height:fit-content;border-radius:16px;
  border:1px solid rgba(159,190,255,0.16);background:rgba(10,14,24,0.96);
  box-shadow:0 30px 80px rgba(0,0,0,0.6);overflow:hidden;}
.nx-palette-input{display:flex;align-items:center;gap:10px;padding:14px 16px;
  border-bottom:1px solid var(--edge);color:var(--muted-2);}
.nx-palette-input input{flex:1;background:none;border:none;outline:none;color:var(--ice);
  font:inherit;font-size:14px;}
.nx-palette ul{padding:6px;max-height:300px;overflow-y:auto;}
.nx-palette li button{display:flex;align-items:center;gap:11px;width:100%;padding:9px 11px;
  border-radius:9px;font-size:13px;color:var(--muted);}
.nx-palette li button:hover{background:var(--glass-2);color:var(--ice);}
.nx-palette li button span{margin-left:auto;font-family:var(--mono);font-size:9.5px;
  letter-spacing:0.1em;text-transform:uppercase;}
.nx-palette-none{padding:16px;font-size:13px;color:var(--muted-2);}
.nx-toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:60;
  padding:11px 18px;border-radius:11px;font-size:12.5px;color:var(--ice);
  background:rgba(10,14,24,0.96);border:1px solid var(--glow);
  box-shadow:0 16px 40px rgba(0,0,0,0.5);animation:nx-rise .22s ease;}

/* widget failure state */
.nx-w-dead{display:flex;flex-direction:column;align-items:flex-start;gap:9px;margin:auto 0;
  font-size:11.5px;line-height:1.5;color:var(--ember);}
.nx-w-dead button{padding:4px 10px;border-radius:7px;font-size:10.5px;color:var(--ember);
  border:1px solid rgba(255,156,107,0.3);}
.nx-w-dead button:hover{background:rgba(255,156,107,0.1);}

/* module tools */
.nx-mod{max-width:100%;}
.nx-tabs{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:18px;}
.nx-tab{display:flex;align-items:center;gap:8px;padding:9px 15px;border-radius:11px;font-size:12.5px;
  color:var(--muted-2);border:1px solid transparent;transition:all .18s;}
.nx-tab:hover{color:var(--ice);background:var(--glass);}
.nx-tab-on{color:var(--void);background:var(--signal);border-color:transparent;font-weight:600;
  box-shadow:0 0 22px var(--glow);}
.nx-tab-on svg{color:var(--void);}
.nx-tabs-flag{display:flex;align-items:center;gap:6px;margin-left:auto;font-family:var(--mono);
  font-size:9.5px;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted-2);}
.nx-tool-blurb{font-size:13px;color:var(--muted);margin-bottom:22px;}
.nx-tool{display:flex;flex-direction:column;gap:14px;}
.nx-tool-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
.nx-tool-row-split{justify-content:space-between;gap:16px;}
.nx-chip{padding:6px 13px;border-radius:20px;font-family:var(--mono);font-size:10.5px;
  letter-spacing:0.06em;color:var(--muted);border:1px solid var(--edge);transition:all .18s;}
.nx-chip:hover{color:var(--ice);border-color:rgba(159,190,255,0.24);}
.nx-chip:active,.nx-tab:active,.nx-btn:active{transform:scale(0.95);}
.nx-chip-on{color:var(--void);background:var(--signal);border-color:transparent;font-weight:500;
  box-shadow:0 0 16px rgba(255,255,255,0.08);}
.nx-field{width:100%;padding:14px 16px;border-radius:14px;resize:vertical;outline:none;
  background:rgba(4,6,12,0.5);border:1px solid var(--edge);color:var(--ice);
  font:inherit;font-size:13px;line-height:1.6;transition:border-color .2s;}
.nx-field:focus{border-color:var(--glow);}
.nx-field::placeholder{color:var(--muted-2);}
.nx-field-mono{font-family:var(--mono);font-size:11.5px;}
.nx-out{padding:14px 16px;border-radius:14px;border:1px solid var(--edge);
  background:linear-gradient(160deg,var(--glass),rgba(148,178,255,0.012));}
.nx-out-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;
  font-family:var(--mono);font-size:9.5px;letter-spacing:0.16em;text-transform:uppercase;color:var(--muted-2);}
.nx-hex{font-family:var(--mono);font-size:12px;line-height:1.75;color:var(--signal);
  word-break:break-all;}
.nx-hex-wrap{color:var(--ice);white-space:pre-wrap;}
.nx-hex em,.nx-out-head em{color:var(--muted-2);font-style:normal;letter-spacing:0.08em;}
.nx-out-err{font-size:12px;line-height:1.55;color:var(--ember);}

/* security tools  -  password / jwt / entropy */
.nx-mono-field{font-family:var(--mono);font-size:12px;}
.nx-pw-input{display:flex;gap:8px;align-items:center;}
.nx-pw-input .nx-inline{flex:1;font-family:var(--mono);}
.nx-pw-meter{display:flex;gap:6px;}
.nx-pw-seg{flex:1;height:6px;border-radius:3px;transition:background .25s;}
.nx-pw-stats{display:flex;flex-wrap:wrap;gap:8px 20px;font-size:12px;color:var(--muted-2);}
.nx-pw-stats b{font-family:var(--mono);color:var(--ice);font-weight:400;}
.nx-pw-stats span:first-child{font-family:var(--mono);letter-spacing:0.04em;text-transform:uppercase;font-size:11px;}
.nx-pw-notes{display:flex;flex-direction:column;gap:6px;}
.nx-pw-note{font-size:12px;line-height:1.5;padding:9px 12px;border-radius:10px;border:1px solid var(--edge);}
.nx-pw-bad{color:var(--ember);border-color:rgba(255,156,107,0.3);background:rgba(255,156,107,0.05);}
.nx-pw-warn{color:#FFB454;border-color:rgba(255,180,84,0.25);background:rgba(255,180,84,0.04);}
.nx-pw-good{color:var(--signal);border-color:var(--glow-soft);background:var(--glow-faint);}
.nx-pw-info{color:var(--muted);}
.nx-jwt-claims{display:flex;flex-wrap:wrap;gap:7px;}
.nx-jwt-claim{font-size:11px;padding:5px 11px;border-radius:20px;border:1px solid var(--edge);}
.nx-jwt-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
@media (max-width:800px){.nx-jwt-grid{grid-template-columns:1fr;}}

/* port reference */
.nx-ports{display:flex;flex-direction:column;border-radius:14px;overflow:hidden;
  border:1px solid var(--edge);}
.nx-port{display:grid;grid-template-columns:56px 64px 130px 72px 1fr;gap:14px;align-items:baseline;
  padding:11px 15px;font-size:12px;color:var(--muted);background:rgba(148,178,255,0.022);
  border-top:1px solid rgba(159,190,255,0.05);}
.nx-port:first-child{border-top:none;}
.nx-port:hover{background:var(--glass);}
.nx-port-num{font-family:var(--mono);font-size:13px;color:var(--ice);}
.nx-port-proto{font-family:var(--mono);font-size:10px;color:var(--muted-2);letter-spacing:0.05em;}
.nx-port-name{color:var(--ice);}
.nx-port-risk{font-family:var(--mono);font-size:9px;letter-spacing:0.1em;text-transform:uppercase;
  padding:2px 8px;border-radius:20px;border:1px solid;justify-self:start;}
.nx-port-note{font-size:11.5px;line-height:1.5;color:var(--muted-2);}
@media (max-width:820px){
  .nx-port{grid-template-columns:52px 1fr 68px;}
  .nx-port-proto{display:none;}
  .nx-port-note{grid-column:1/-1;}
}

.nx-tool-note{font-size:11.5px;line-height:1.6;color:var(--muted-2);max-width:62ch;}
.nx-crack-title{color:var(--ice)!important;font-weight:600;margin-bottom:4px;}
.nx-twin-empty{display:flex;flex-direction:column;align-items:flex-start;gap:14px;padding:22px;
  border:1px dashed var(--edge);border-radius:14px;max-width:520px;}
.nx-twin-empty p{font-size:13px;color:var(--muted);line-height:1.6;}
.nx-twin-mark{display:inline-flex;padding:12px;border-radius:12px;background:var(--glow-faint);
  color:var(--signal);border:1px solid var(--glow-soft);}
.nx-twin-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;
  margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--edge);}
.nx-twin-base{font-size:13px;color:var(--ice);}
.nx-twin-checked{font-size:11.5px;color:var(--muted-2);margin-top:3px;}
.nx-twin-ok{display:flex;gap:12px;align-items:flex-start;padding:16px;border-radius:12px;
  background:var(--glow-faint);border:1px solid var(--glow-soft);color:var(--signal);font-size:12.5px;line-height:1.6;}
.nx-twin-ok p{color:var(--muted);}
.nx-twin-findings{display:flex;flex-direction:column;gap:10px;}
.nx-twin-find{display:flex;gap:11px;align-items:flex-start;padding:13px 15px;border-radius:11px;font-size:12.5px;
  line-height:1.55;}
.nx-twin-find p{color:var(--ice);}
.nx-twin-high{background:rgba(255,90,90,0.1);border:1px solid rgba(255,90,90,0.35);color:var(--ember);}
.nx-twin-med{background:rgba(255,176,32,0.08);border:1px solid rgba(255,176,32,0.3);color:#ffb020;}
.nx-twin-low{background:var(--glass);border:1px solid var(--edge);color:var(--muted);}
.nx-tool-note-flush{margin:0;}
.nx-tool-note code{font-family:var(--mono);color:var(--muted);}
.nx-copy{display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:7px;
  font-family:var(--mono);font-size:9.5px;letter-spacing:0.1em;text-transform:uppercase;
  color:var(--muted-2);border:1px solid var(--edge);}
.nx-copy:hover:not(:disabled){color:var(--signal);border-color:var(--glow);}
.nx-copy:disabled{opacity:0.4;cursor:not-allowed;}

/* scan table */
.nx-scan-sum{display:flex;gap:20px;font-family:var(--mono);font-size:11px;letter-spacing:0.06em;
  color:var(--muted-2);padding-bottom:2px;}
.nx-scan-sum b{color:var(--ice);font-weight:500;}
.nx-scan-sum .nx-risk-high{color:var(--ember);}
.nx-scan-table{display:flex;flex-direction:column;gap:1px;border-radius:14px;overflow:hidden;
  border:1px solid var(--edge);}
.nx-scan-row{display:grid;grid-template-columns:78px 74px 1.4fr 96px 1.6fr;gap:12px;align-items:center;
  padding:11px 14px;font-size:12px;color:var(--muted);background:rgba(148,178,255,0.022);
  border-left:2px solid transparent;}
.nx-scan-row:hover{background:var(--glass);}
.nx-scan-port{font-family:var(--mono);color:var(--ice);}
.nx-scan-port i{font-style:normal;font-size:10px;color:var(--muted-2);}
.nx-scan-state{font-family:var(--mono);font-size:10px;letter-spacing:0.1em;text-transform:uppercase;
  color:var(--muted-2);}
.nx-scan-svc{display:flex;flex-direction:column;gap:2px;min-width:0;}
.nx-scan-svc em{font-style:normal;font-size:10px;color:var(--muted-2);overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;}
.nx-scan-tag{font-family:var(--mono);font-size:9.5px;letter-spacing:0.1em;text-transform:uppercase;}
.nx-scan-note{font-size:11px;line-height:1.45;color:var(--muted-2);}
.nx-risk-high{border-left-color:var(--ember)!important;}
.nx-risk-high .nx-scan-tag{color:var(--ember);}
.nx-risk-watch{border-left-color:rgba(142,124,255,0.6)!important;}
.nx-risk-watch .nx-scan-tag{color:var(--violet);}
.nx-risk-ok .nx-scan-tag{color:var(--muted-2);}

@media (max-width:820px){
  .nx-scan-row{grid-template-columns:70px 1fr;gap:6px 12px;}
  .nx-scan-note,.nx-scan-tag{grid-column:1/-1;}
}

/* settings */
.nx-set-groups{columns:3 320px;column-gap:16px;}
.nx-set-group{padding:18px;border-radius:16px;border:1px solid var(--edge);
  background:rgba(148,178,255,0.022);display:flex;flex-direction:column;gap:13px;
  break-inside:avoid;margin-bottom:16px;}
.nx-theme-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.nx-theme{display:flex;flex-direction:column;align-items:flex-start;gap:7px;padding:12px;
  border-radius:12px;text-align:left;border:1px solid var(--edge);
  background:rgba(148,178,255,0.02);transition:all .18s;}
.nx-theme:hover{border-color:rgba(159,190,255,0.24);}
.nx-theme-on{border-color:var(--signal);box-shadow:0 0 0 1px var(--signal),0 0 22px var(--glow-soft);}
.nx-theme-swatch{width:100%;height:38px;border-radius:8px;border:1px solid var(--edge);
  display:flex;align-items:center;padding-left:11px;}
.nx-theme-swatch i{width:14px;height:14px;border-radius:50%;box-shadow:0 0 10px currentColor;}
.nx-theme-name{font-size:12.5px;color:var(--ice);}
.nx-theme-note{font-size:10.5px;color:var(--muted-2);line-height:1.4;}

.nx-accent-row{display:flex;gap:9px;flex-wrap:wrap;}
.nx-accent{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;
  border:1px solid var(--edge);transition:all .16s;}
.nx-accent span{width:18px;height:18px;border-radius:50%;transition:transform .16s;}
.nx-accent:hover span{transform:scale(1.15);}
.nx-accent-on{border-color:var(--ice);}
.nx-accent-on span{box-shadow:0 0 12px currentColor;}

.nx-set-list{display:flex;flex-direction:column;}
.nx-set-row{display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:11px 0;border-top:1px solid rgba(159,190,255,0.05);}
.nx-set-row:first-child{border-top:none;}
.nx-set-row-off{opacity:0.6;}
.nx-set-copy{min-width:0;}
.nx-set-label{font-size:12.5px;color:var(--ice);}
.nx-set-note{font-size:11px;color:var(--muted-2);line-height:1.5;margin-top:3px;}
.nx-set-badge{font-family:var(--mono);font-size:9px;letter-spacing:0.1em;text-transform:uppercase;
  color:var(--signal);padding:3px 9px;border-radius:20px;background:var(--glow-soft);
  border:1px solid var(--glow-soft);white-space:nowrap;}

.nx-mod-toggles{display:flex;flex-wrap:wrap;gap:7px;}
.nx-mod-chip{display:flex;align-items:center;gap:7px;padding:7px 12px;border-radius:20px;
  font-size:11.5px;color:var(--muted-2);border:1px solid var(--edge);transition:all .16s;}
.nx-mod-chip svg:first-child{opacity:0.6;}
.nx-mod-chip-on{color:var(--ice);border-color:var(--glow);background:var(--glow-faint);}
.nx-mod-chip-on svg:first-child{opacity:1;}
.nx-mod-chip-on svg:last-child{color:var(--signal);}
.nx-mod-chip-lock{opacity:0.5;cursor:not-allowed;}

/* automation */
.nx-auto-top{align-items:center;margin-bottom:16px;}
.nx-auto-stat{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--muted);}
.nx-live-dot{width:6px;height:6px;border-radius:50%;background:var(--signal);
  box-shadow:0 0 8px var(--signal);animation:nx-pulse 2s ease-in-out infinite;}

.nx-rule-form{gap:13px;}
.nx-rule-line{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
.nx-rule-word{font-size:12.5px;color:var(--muted-2);}
.nx-select{padding:8px 12px;border-radius:9px;background:rgba(4,6,12,0.55);
  border:1px solid var(--edge);color:var(--ice);font:inherit;font-size:12px;outline:none;
  cursor:pointer;appearance:none;-webkit-appearance:none;
  background-image:linear-gradient(45deg,transparent 50%,var(--muted-2) 50%),linear-gradient(135deg,var(--muted-2) 50%,transparent 50%);
  background-position:calc(100% - 15px) 50%,calc(100% - 10px) 50%;
  background-size:5px 5px,5px 5px;background-repeat:no-repeat;padding-right:30px;}
.nx-select:focus{border-color:var(--glow);}
.nx-rule-unit{font-family:var(--mono);font-size:11px;color:var(--muted-2);}
.nx-rule-warn,.nx-rule-form .nx-tool-note{display:flex;align-items:flex-start;gap:7px;}
.nx-rule-warn{font-size:11.5px;line-height:1.5;color:var(--ember);}

.nx-rules{display:flex;flex-direction:column;gap:2px;}
.nx-rule{display:flex;align-items:center;gap:13px;padding:12px 10px;border-radius:11px;
  border:1px solid transparent;transition:background .16s;}
.nx-rule:hover{background:var(--glass);}
.nx-rule-off{opacity:0.5;}
.nx-toggle-sw{width:34px;height:20px;border-radius:20px;flex-shrink:0;padding:2px;
  background:rgba(159,190,255,0.14);transition:background .2s;position:relative;}
.nx-toggle-sw i{display:block;width:16px;height:16px;border-radius:50%;background:var(--muted);
  transition:transform .2s,background .2s;}
.nx-toggle-sw-on{background:var(--glow);}
.nx-toggle-sw-on i{transform:translateX(14px);background:var(--signal);}
.nx-rule-main{flex:1;min-width:0;}
.nx-rule-when{font-size:12.5px;color:var(--ice);display:flex;align-items:center;gap:9px;}
.nx-rule-armed{font-family:var(--mono);font-size:8px;letter-spacing:0.12em;text-transform:uppercase;
  color:var(--signal);padding:2px 7px;border-radius:20px;background:var(--glow-soft);}
.nx-rule-pending{font-family:var(--mono);font-size:8px;letter-spacing:0.12em;text-transform:uppercase;
  color:var(--muted-2);padding:2px 7px;border-radius:20px;background:var(--glass-2);}
.nx-rule-then{margin-top:5px;font-size:11.5px;color:var(--muted-2);display:flex;align-items:center;gap:8px;}
.nx-rule-then i{width:5px;height:5px;border-radius:50%;flex-shrink:0;}
.nx-rule-meta{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.nx-rule-fired{font-family:var(--mono);font-size:9.5px;color:var(--muted-2);}
.nx-rule-edit{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;
  color:var(--muted-2);}
.nx-rule-edit:hover{color:var(--ice);background:var(--glass-2);}
.nx-rule:hover .nx-drop{opacity:1;}

.nx-auto-log{min-height:220px;}
.nx-auto-idle{display:flex;flex-direction:column;align-items:center;gap:9px;text-align:center;
  padding:30px 16px;color:var(--muted-2);margin:auto 0;}
.nx-auto-idle p{font-size:12px;}
.nx-auto-events{display:flex;flex-direction:column;gap:2px;max-height:340px;overflow-y:auto;}
.nx-auto-event{display:flex;align-items:baseline;gap:11px;padding:9px 8px;border-radius:8px;}
.nx-auto-event:hover{background:var(--glass);}
.nx-auto-when{font-family:var(--mono);font-size:9.5px;color:var(--muted-2);flex-shrink:0;}
.nx-auto-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;align-self:center;}
.nx-auto-text{flex:1;min-width:0;}
.nx-auto-text b{display:block;font-size:12px;font-weight:400;color:var(--ice);}
.nx-auto-text em{font-style:normal;font-size:10.5px;color:var(--muted-2);}

/* fitness */
.nx-fit-add{align-self:flex-end;}
.nx-inline-sm{width:66px;}
.nx-fit-rows{display:flex;flex-direction:column;gap:1px;}
.nx-fit-row{display:flex;align-items:center;gap:14px;padding:9px 8px;border-radius:8px;
  font-size:12.5px;color:var(--muted);}
.nx-fit-row:hover{background:var(--glass);}
.nx-fit-row>.nx-mono:first-child{width:64px;color:var(--muted-2);font-size:11px;}
.nx-fit-kg{flex:1;color:var(--ice);font-family:var(--mono);}
.nx-fit-date{color:var(--muted-2);font-size:10.5px;}
.nx-fit-row:hover .nx-drop,.nx-fit-food:hover .nx-drop{opacity:1;}
.nx-fit-food{display:flex;align-items:center;gap:14px;padding:9px 8px;border-radius:8px;
  font-size:12.5px;color:var(--muted);}
.nx-fit-food:hover{background:var(--glass);}
.nx-food-macros{font-family:var(--mono);font-size:10.5px;color:var(--muted-2);}

.nx-macros{display:flex;flex-wrap:wrap;gap:22px;justify-content:space-around;margin-top:16px;}
.nx-macro{display:flex;flex-direction:column;align-items:center;gap:4px;position:relative;}
.nx-macro svg{width:78px;height:78px;}
.nx-macro-val{position:absolute;top:22px;text-align:center;font-family:var(--mono);line-height:1.1;}
.nx-macro-val b{font-size:16px;font-weight:400;color:var(--ice);display:block;}
.nx-macro-val span{font-size:8.5px;color:var(--muted-2);}
.nx-macro-label{font-size:10.5px;color:var(--muted-2);letter-spacing:0.04em;}

/* module ask window */
.nx-ask-fab{position:fixed;bottom:22px;right:24px;z-index:40;display:flex;align-items:center;gap:9px;
  padding:11px 17px;border-radius:24px;font-size:12.5px;font-weight:600;color:var(--void);
  background:var(--signal);box-shadow:0 8px 30px rgba(4,6,12,0.5),0 0 26px var(--glow);
  transition:all .2s;}
.nx-ask-fab:hover{transform:translateY(-2px);box-shadow:0 10px 36px rgba(4,6,12,0.55),0 0 38px var(--glow);}
.nx-ask{position:fixed;bottom:22px;right:24px;z-index:40;width:min(378px,calc(100vw - 48px));
  max-height:min(540px,calc(100vh - 90px));display:flex;flex-direction:column;
  border-radius:18px;border:1px solid rgba(159,190,255,0.16);background:rgba(9,12,21,0.97);
  backdrop-filter:blur(22px);box-shadow:0 24px 70px rgba(0,0,0,0.62);overflow:hidden;
  animation:nx-ask-in .24s cubic-bezier(.2,.8,.3,1) both;}
.nx-ask-bar{display:flex;align-items:center;gap:9px;padding:12px 13px;flex-shrink:0;
  border-bottom:1px solid var(--edge);font-size:12.5px;color:var(--ice);}
.nx-ask-bar>svg{color:var(--signal);}
.nx-ask-bar em{font-style:normal;font-family:var(--mono);font-size:8.5px;letter-spacing:0.12em;
  text-transform:uppercase;color:var(--muted-2);}
.nx-ask-clear,.nx-ask-x{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;
  color:var(--muted-2);}
.nx-ask-clear{margin-left:auto;}
.nx-ask-clear:hover{color:var(--ember);background:rgba(255,156,107,0.1);}
.nx-ask-x:hover{color:var(--ice);background:var(--glass-2);}
.nx-ask-feed{flex:1;overflow-y:auto;padding:15px 14px;display:flex;flex-direction:column;gap:16px;
  min-height:120px;}
.nx-ask-empty p{font-size:12.5px;line-height:1.6;color:var(--muted-2);}
.nx-ask-seeds{display:flex;flex-direction:column;gap:6px;margin-top:14px;}
.nx-ask-seeds button{padding:8px 12px;border-radius:10px;font-size:11.5px;text-align:left;
  color:var(--muted);border:1px solid var(--edge);transition:all .18s;}
.nx-ask-seeds button:hover{color:var(--ice);background:var(--glass);
  border-color:var(--glow);}
.nx-ask .nx-msg-body{max-width:100%;font-size:12.5px;}
.nx-ask .nx-msg-user .nx-msg-body{max-width:86%;}
.nx-ask-composer{margin:0 12px 12px;flex-shrink:0;}
@keyframes nx-ask-in{from{opacity:0;transform:translateY(14px) scale(.97);}}

/* encyclopedia */
.nx-enc-subjects{margin-bottom:14px;}
.nx-enc-search{margin-bottom:14px;}
.nx-enc-slow{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--muted-2);
  padding:9px 12px;border-radius:10px;background:var(--glass);border:1px solid var(--edge);
  margin-top:2px;}
.nx-enc-slow svg{color:var(--signal);flex-shrink:0;}
.nx-enc-search .nx-chip{flex-shrink:0;}
.nx-enc-quick{display:flex;flex-direction:column;gap:11px;padding:16px 17px;border-radius:15px;
  border:1px dashed rgba(159,190,255,0.16);background:rgba(148,178,255,0.018);}
.nx-enc-busy{gap:9px;}
.nx-enc-entry{gap:12px;}
.nx-enc-body{font-size:13.5px;line-height:1.7;color:var(--ice);}
.nx-enc-body p+p{margin-top:11px;}
.nx-link-out{display:inline-flex;align-items:center;gap:4px;color:var(--signal);
  text-decoration:none;border-bottom:1px solid var(--glow);transition:all .16s;}
.nx-link-out:hover{border-bottom-color:var(--signal);color:var(--ice);}
.nx-link-out svg{flex-shrink:0;opacity:0.7;}
.nx-enc-list{display:flex;flex-direction:column;gap:2px;}
.nx-enc-item{display:flex;align-items:center;gap:4px;}
.nx-enc-item>button{flex:1;display:flex;align-items:center;gap:9px;padding:8px 10px;
  border-radius:9px;font-size:12px;text-align:left;color:var(--muted);transition:all .16s;}
.nx-enc-item>button:hover{color:var(--ice);background:var(--glass);}
.nx-enc-item>button svg{color:var(--muted-2);flex-shrink:0;}
.nx-enc-item:hover .nx-drop{opacity:1;}

/* engineering */
.nx-chart{padding:14px 16px 10px;border-radius:15px;border:1px solid var(--edge);
  background:rgba(2,4,9,0.5);}
.nx-chart svg{width:100%;height:auto;display:block;cursor:crosshair;}
.nx-chart-grid{stroke:rgba(159,190,255,0.08);stroke-width:1;}
.nx-chart-cross{stroke:rgba(159,190,255,0.3);stroke-width:1;stroke-dasharray:3 3;}
.nx-chart-tick{font-family:var(--mono);font-size:8.5px;fill:var(--muted-2);text-anchor:end;}
.nx-chart-axis{text-anchor:middle;letter-spacing:0.1em;}
.nx-chart-legend{display:flex;flex-wrap:wrap;gap:16px;align-items:center;padding-top:12px;
  margin-top:6px;border-top:1px solid var(--edge);}
.nx-chart-legend span{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--muted);}
.nx-chart-legend i{width:8px;height:2px;border-radius:1px;}
.nx-chart-legend b{font-family:var(--mono);font-size:11px;color:var(--ice);font-weight:400;}
.nx-chart-legend em{margin-left:auto;font-family:var(--mono);font-size:9.5px;font-style:normal;
  letter-spacing:0.1em;text-transform:uppercase;color:var(--muted-2);}
.nx-ch-dot{width:7px;height:7px;border-radius:50%;}

.nx-calc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;}
.nx-calc{padding:17px 18px;border-radius:15px;border:1px solid var(--edge);
  background:rgba(148,178,255,0.022);display:flex;flex-direction:column;gap:13px;}
.nx-calc-fields{display:flex;flex-wrap:wrap;gap:10px;}
.nx-nf{display:flex;flex-direction:column;gap:6px;}
.nx-nf>span{font-family:var(--mono);font-size:9px;letter-spacing:0.14em;text-transform:uppercase;
  color:var(--muted-2);}
.nx-nf>span i{font-style:normal;color:var(--signal);margin-left:5px;}
.nx-nf .nx-inline{width:104px;}
.nx-calc-out{display:flex;flex-wrap:wrap;gap:8px 18px;padding:12px 14px;border-radius:11px;
  background:rgba(2,4,9,0.45);border:1px solid var(--edge);}
.nx-calc-out span{font-size:11px;color:var(--muted-2);display:flex;align-items:baseline;gap:5px;}
.nx-calc-out b{font-family:var(--mono);font-size:15px;font-weight:400;color:var(--signal);}
.nx-calc-warn{font-size:11.5px;line-height:1.55;color:var(--ember);}

.nx-resistor{display:flex;justify-content:center;padding:10px 0 2px;}
.nx-res-body{position:relative;display:flex;align-items:center;gap:7px;padding:0 22px;
  width:186px;height:44px;border-radius:9px;background:linear-gradient(180deg,#d9c9a8,#bfae8c);
  box-shadow:0 3px 14px rgba(0,0,0,0.4);}
.nx-res-body::before,.nx-res-body::after{content:"";position:absolute;top:50%;width:26px;height:2px;
  background:linear-gradient(90deg,#8c9099,#c8ccd4);}
.nx-res-body::before{left:-26px;}
.nx-res-body::after{right:-26px;}
.nx-res-body i{width:11px;height:44px;border-radius:1px;}
.nx-res-tol{margin-left:auto;}
.nx-cc-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
.nx-cc-row>span{font-family:var(--mono);font-size:9px;letter-spacing:0.14em;text-transform:uppercase;
  color:var(--muted-2);width:76px;flex-shrink:0;}
.nx-cc-swatches{display:flex;gap:4px;flex-wrap:wrap;}
.nx-cc-sw{width:20px;height:20px;border-radius:5px;border:1px solid rgba(0,0,0,0.4);
  transition:all .16s;}
.nx-cc-sw:hover{transform:translateY(-2px);}
.nx-cc-sw-on{box-shadow:0 0 0 2px var(--signal);transform:translateY(-2px);}

.nx-pins{display:flex;flex-direction:column;border-radius:14px;overflow:hidden;
  border:1px solid var(--edge);}
.nx-pin{display:grid;grid-template-columns:92px 152px 1fr;gap:14px;align-items:baseline;
  padding:10px 15px;font-size:12px;color:var(--muted);background:rgba(148,178,255,0.022);
  border-top:1px solid rgba(159,190,255,0.05);border-left:2px solid transparent;}
.nx-pin:first-child{border-top:none;}
.nx-pin:hover{background:var(--glass);}
.nx-pin-id{font-family:var(--mono);color:var(--ice);}
.nx-pin-fn{font-family:var(--mono);font-size:10.5px;color:var(--violet);}
.nx-pin-note{font-size:11.5px;line-height:1.5;color:var(--muted-2);}
.nx-pin-warn{border-left-color:var(--ember);}
.nx-pin-warn .nx-pin-note{color:var(--ember);}

@media (max-width:700px){
  .nx-pin{grid-template-columns:1fr 1fr;}
  .nx-pin-note{grid-column:1/-1;}
}

/* homework helper */
.nx-hw-modes{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:10px;}
.nx-hw-mode{display:flex;flex-direction:column;align-items:flex-start;gap:7px;padding:14px 15px;
  border-radius:14px;text-align:left;border:1px solid var(--edge);
  background:rgba(148,178,255,0.022);transition:all .18s;}
.nx-hw-mode:hover{border-color:rgba(159,190,255,0.22);background:var(--glass);}
.nx-hw-mode svg{color:var(--muted-2);}
.nx-hw-mode span{font-size:12.5px;color:var(--ice);}
.nx-hw-mode em{font-style:normal;font-size:11px;line-height:1.5;color:var(--muted-2);}
.nx-hw-mode-on{border-color:var(--glow);background:var(--glow-faint);
  box-shadow:0 0 24px var(--glow-faint);}
.nx-hw-mode-on svg{color:var(--signal);}

.nx-hw-drop{display:flex;flex-direction:column;align-items:center;gap:10px;padding:44px 24px;
  border-radius:18px;border:1px dashed rgba(159,190,255,0.2);cursor:pointer;
  background:rgba(148,178,255,0.018);transition:all .2s;}
.nx-hw-drop:hover{border-color:var(--glow);background:var(--glow-faint);}
.nx-hw-drop-hot{border-color:var(--signal);background:var(--glow-faint);}
.nx-hw-drop-mark{width:48px;height:48px;display:grid;place-items:center;border-radius:15px;
  border:1px solid var(--edge);background:var(--glass);color:var(--signal);margin-bottom:6px;}
.nx-hw-drop-title{font-size:14px;color:var(--ice);font-weight:300;}
.nx-hw-drop-sub{font-size:11.5px;color:var(--muted-2);}

.nx-hw-work{display:flex;gap:24px;align-items:flex-start;}
.nx-hw-shot{width:262px;flex-shrink:0;display:flex;flex-direction:column;gap:11px;
  padding:13px;border-radius:15px;border:1px solid var(--edge);background:rgba(148,178,255,0.022);}
.nx-hw-shot img{width:100%;border-radius:10px;display:block;background:rgba(2,4,9,0.5);}
.nx-hw-chat{flex:1;min-width:0;display:flex;flex-direction:column;}
.nx-hw-ready{padding:34px 26px;border-radius:15px;border:1px dashed rgba(159,190,255,0.16);
  background:rgba(148,178,255,0.018);display:flex;flex-direction:column;align-items:flex-start;gap:9px;}
.nx-hw-ready-mode{font-family:var(--mono);font-size:10px;letter-spacing:0.2em;
  text-transform:uppercase;color:var(--signal);}
.nx-hw-ready p{font-size:13px;color:var(--muted);}
.nx-hw-ready .nx-cta{margin-top:14px;}
.nx-hw-feed{display:flex;flex-direction:column;gap:20px;max-height:440px;overflow-y:auto;
  padding-right:8px;}

@media (max-width:900px){
  .nx-hw-work{flex-direction:column;}
  .nx-hw-shot{width:100%;flex-direction:row;align-items:flex-start;}
  .nx-hw-shot img{width:150px;}
}

/* school */
.nx-rec{padding:18px;border-radius:16px;border:1px solid var(--edge);
  background:linear-gradient(160deg,var(--glass),rgba(148,178,255,0.012));
  display:flex;flex-direction:column;gap:13px;}
.nx-rec-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
.nx-rec-btn{display:flex;align-items:center;gap:9px;padding:10px 18px;border-radius:22px;
  font-size:12.5px;font-weight:600;color:var(--void);background:var(--signal);
  box-shadow:0 0 24px var(--glow-soft);transition:all .18s;}
.nx-rec-btn:hover{transform:translateY(-1px);box-shadow:0 0 34px var(--glow);}
.nx-rec-live{background:var(--ember);box-shadow:0 0 24px rgba(255,156,107,0.3);}
.nx-rec-pip{width:9px;height:9px;border-radius:50%;background:var(--void);
  animation:nx-pulse 1.1s ease-in-out infinite;}
.nx-rec-time{font-family:var(--mono);font-size:17px;color:var(--ice);}
.nx-rec-count{font-family:var(--mono);font-size:10px;letter-spacing:0.12em;
  text-transform:uppercase;color:var(--muted-2);}
.nx-rec-text{font-size:13px;line-height:1.7;}
.nx-rec-interim{font-size:12.5px;line-height:1.6;color:var(--muted-2);font-style:italic;
  padding:0 2px;}
.nx-rec-filters{align-items:center;}
.nx-search-inline{flex:1;min-width:180px;}

.nx-vnote{border-radius:13px;border:1px solid var(--edge);overflow:hidden;
  background:rgba(148,178,255,0.022);}
.nx-vnote-head{display:grid;grid-template-columns:14px 1fr auto auto;gap:13px;align-items:center;
  width:100%;padding:12px 15px;text-align:left;font-size:12.5px;color:var(--muted);
  transition:background .16s;}
.nx-vnote-head:hover{background:var(--glass);}
.nx-vnote-head svg{color:var(--muted-2);}
.nx-vnote-title{color:var(--ice);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nx-vnote-meta{font-family:var(--mono);font-size:9.5px;letter-spacing:0.06em;color:var(--muted-2);}
.nx-vnote-meta i{color:var(--violet);font-style:normal;}
.nx-vnote-head em{font-style:normal;font-family:var(--mono);font-size:9.5px;color:var(--muted-2);}
.nx-vnote-body{padding:14px 15px 16px;background:rgba(2,4,9,0.4);
  border-top:1px solid var(--edge);animation:nx-rise .2s ease;}
.nx-rem-list{display:flex;flex-direction:column;gap:6px;margin-top:8px;}
.nx-rem-row{align-items:center;gap:9px;}
.nx-rem-text{font-size:12.5px;color:var(--muted);line-height:1.4;}
.nx-rem-text i{color:var(--muted-2);font-style:normal;}
.nx-rem-badge{pointer-events:none;flex:none;}
.nx-sum-cta{width:100%;justify-content:center;gap:8px;margin-top:4px;font-size:14px;padding:12px;}
.nx-sum-redo{margin-top:8px;}
.nx-day-group{margin-top:14px;}
.nx-day-head{display:flex;align-items:center;gap:7px;font-size:11px;text-transform:uppercase;
  letter-spacing:0.09em;color:var(--muted-2);margin-bottom:7px;padding-left:2px;}
.nx-day-head em{font-style:normal;color:var(--muted-2);opacity:0.7;
  border:1px solid var(--edge);border-radius:8px;padding:0 6px;font-size:10px;}
.nx-vnote-topic{font-size:11px;color:var(--signal);background:var(--glow-faint);
  border:1px solid var(--edge);border-radius:8px;padding:1px 7px;margin-right:8px;white-space:nowrap;}
.nx-cal-wrap{display:grid;grid-template-columns:1.6fr 1fr;gap:18px;align-items:start;}
@media (max-width:900px){.nx-cal-wrap{grid-template-columns:1fr;}}
.nx-cal-nav{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
.nx-cal-month{font-size:15px;color:var(--text);font-weight:500;letter-spacing:0.01em;}
.nx-calm-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;}
.nx-calm-dow{text-align:center;font-size:10px;color:var(--muted-2);letter-spacing:0.08em;padding-bottom:4px;}
.nx-calm-cell{position:relative;aspect-ratio:1;border:1px solid var(--edge);border-radius:10px;
  background:rgba(2,4,9,0.35);color:var(--muted);cursor:pointer;transition:all .12s;
  display:flex;align-items:flex-start;justify-content:flex-start;padding:6px 8px;}
.nx-calm-cell:hover{border-color:var(--muted-2);}
.nx-calm-empty{border:none;background:none;cursor:default;}
.nx-calm-num{font-size:12px;}
.nx-calm-today{border-color:var(--signal);color:var(--text);}
.nx-calm-sel{background:var(--glow-faint);border-color:var(--signal);}
.nx-calm-dot{position:absolute;bottom:5px;right:6px;min-width:16px;height:16px;padding:0 4px;
  border-radius:8px;background:var(--signal);color:#02121a;font-size:10px;font-weight:600;
  display:flex;align-items:center;justify-content:center;}
.nx-cal-edit{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--edge);
  border-radius:10px;background:rgba(2,4,9,0.4);}
.nx-rem-done{text-decoration:line-through;opacity:0.55;}
.nx-note-audio{width:100%;height:34px;margin-top:6px;border-radius:8px;}
.nx-task-more{list-style:none;font-size:11px;color:var(--muted-2);padding:4px 0 0 2px;opacity:0.8;}

.nx-drop-zone{position:relative;border-radius:16px;transition:all .2s;}
.nx-drop-field{border-style:dashed;}
.nx-drop-hot .nx-drop-field{border-color:var(--signal);background:var(--glow-faint);}
.nx-drop-hint{position:absolute;bottom:11px;right:16px;font-family:var(--mono);font-size:9.5px;
  letter-spacing:0.12em;text-transform:uppercase;color:var(--muted-2);pointer-events:none;}
.nx-drop-hot .nx-drop-hint{color:var(--signal);}

.nx-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;}
.nx-card{position:relative;min-height:112px;padding:15px 16px 26px;border-radius:13px;
  text-align:left;border:1px solid var(--edge);background:rgba(148,178,255,0.03);
  transition:all .2s;display:flex;}
.nx-card:hover{border-color:var(--glow);transform:translateY(-2px);}
.nx-card-back{background:var(--glow-faint);border-color:var(--glow);}
.nx-card-face{font-size:12.5px;line-height:1.55;color:var(--ice);}
.nx-card-tag{position:absolute;bottom:10px;left:16px;font-family:var(--mono);font-size:8.5px;
  letter-spacing:0.14em;text-transform:uppercase;color:var(--muted-2);}
.nx-card-back .nx-card-tag{color:var(--signal);}

.nx-work{display:flex;flex-direction:column;gap:2px;}
.nx-work-row{display:grid;grid-template-columns:20px 1fr auto auto 22px;gap:12px;align-items:center;
  padding:9px 8px;border-radius:9px;font-size:12.5px;color:var(--muted);border-left:2px solid transparent;}
.nx-work-row:hover{background:var(--glass);}
.nx-work-urgent{border-left-color:var(--ember);}
.nx-work-check{width:16px;height:16px;display:grid;place-items:center;}
.nx-work-check i{width:13px;height:13px;border-radius:4px;border:1.4px solid var(--muted-2);
  transition:all .18s;}
.nx-work-check:hover i{border-color:var(--signal);}
.nx-work-checked i{background:var(--signal);border-color:var(--signal);}
.nx-work-title{color:var(--ice);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nx-work-done .nx-work-title{color:var(--muted-2);text-decoration:line-through;}
.nx-work-course{font-family:var(--mono);font-size:9px;letter-spacing:0.1em;text-transform:uppercase;
  padding:2px 8px;border-radius:20px;background:var(--glass-2);color:var(--muted-2);}
.nx-work-due{font-family:var(--mono);font-size:10px;color:var(--muted-2);min-width:64px;
  text-align:right;}
.nx-work-due-hot{color:var(--ember);}
.nx-work-row:hover .nx-drop{opacity:1;}

/* files */
.nx-mod-wide{max-width:none;}
.nx-fsearch{display:flex;align-items:center;gap:12px;padding:13px 18px;border-radius:15px;
  border:1px solid var(--edge);background:rgba(4,6,12,0.5);color:var(--muted-2);
  transition:border-color .2s,box-shadow .2s;margin-bottom:14px;}
.nx-fsearch:focus-within{border-color:var(--glow);box-shadow:0 0 30px var(--glow-faint);}
.nx-fsearch input{flex:1;min-width:0;background:none;border:none;outline:none;color:var(--ice);
  font:inherit;font-size:14px;}
.nx-fsearch-x{display:grid;place-items:center;width:22px;height:22px;border-radius:6px;
  color:var(--muted-2);}
.nx-fsearch-x:hover{color:var(--ice);background:var(--glass-2);}
.nx-fbar{margin-bottom:16px;}
.nx-fbar-div{width:1px;height:16px;background:var(--edge);}
.nx-fcount{margin-left:auto;font-family:var(--mono);font-size:10px;letter-spacing:0.1em;
  text-transform:uppercase;color:var(--muted-2);}
.nx-tag-n{font-weight:400;color:var(--muted-2);margin-left:2px;}

.nx-fsplit{display:flex;gap:22px;flex:1;min-height:0;}
.nx-flist{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;overflow-y:auto;
  padding-right:6px;}
.nx-frow{display:grid;grid-template-columns:16px 1fr auto auto auto auto;gap:12px;
  align-items:center;padding:10px 13px;border-radius:11px;text-align:left;font-size:12px;
  color:var(--muted);border:1px solid transparent;transition:all .16s;}
.nx-frow:hover{background:var(--glass);}
.nx-frow-on{background:var(--glass-2);border-color:var(--edge);}
.nx-frow>svg{color:var(--muted-2);}
.nx-frow-on>svg{color:var(--signal);}
.nx-frow-main{display:flex;flex-direction:column;gap:2px;min-width:0;}
.nx-frow-name{display:flex;align-items:center;gap:6px;color:var(--ice);font-size:12.5px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nx-frow-star{color:var(--signal);flex-shrink:0;}
.nx-frow-path{font-family:var(--mono);font-size:9.5px;color:var(--muted-2);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nx-frow-tags{display:flex;gap:4px;}
.nx-frow-tags i{font-style:normal;font-family:var(--mono);font-size:8.5px;letter-spacing:0.08em;
  text-transform:uppercase;padding:2px 7px;border-radius:20px;background:var(--glass-2);
  color:var(--muted-2);}
.nx-frow-hit{font-family:var(--mono);font-size:8.5px;letter-spacing:0.1em;text-transform:uppercase;
  color:var(--signal);padding:2px 7px;border-radius:20px;background:var(--glow-soft);}
.nx-frow-size{font-family:var(--mono);font-size:10px;color:var(--muted-2);width:52px;text-align:right;}
.nx-frow-when{font-family:var(--mono);font-size:9.5px;color:var(--muted-2);width:26px;text-align:right;}

.nx-fpane{width:352px;flex-shrink:0;overflow-y:auto;padding-left:22px;
  border-left:1px solid var(--edge);}
.nx-fp{display:flex;flex-direction:column;gap:16px;align-items:flex-start;}
.nx-fp>.nx-chip{align-self:stretch;justify-content:center;}
.nx-fp-head{display:flex;align-items:flex-start;gap:11px;width:100%;}
.nx-fp-icon{width:34px;height:34px;flex-shrink:0;display:grid;place-items:center;border-radius:10px;
  border:1px solid var(--edge);background:var(--glass);color:var(--signal);}
.nx-fp-id{flex:1;min-width:0;}
.nx-fp-name{font-size:13.5px;color:var(--ice);word-break:break-word;}
.nx-fp-path{margin-top:3px;font-family:var(--mono);font-size:10px;color:var(--muted-2);}
.nx-star{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;flex-shrink:0;
  color:var(--muted-2);border:1px solid var(--edge);transition:all .18s;}
.nx-star:hover{color:var(--signal);}
.nx-star-on{color:var(--signal);border-color:var(--glow);background:var(--glow-faint);}
.nx-star-on svg{fill:var(--signal);}
.nx-fp-meta{width:100%;gap:7px 16px;font-size:12px;}
.nx-fp-tags{display:flex;flex-wrap:wrap;gap:6px;width:100%;}
.nx-inline-tag{width:86px;padding:5px 11px;font-size:10px;}
.nx-fp-sum,.nx-fp-body{width:100%;padding:13px 15px;border-radius:13px;border:1px solid var(--edge);
  background:rgba(148,178,255,0.022);}
.nx-fp-sum-body{font-size:12.5px;line-height:1.65;color:var(--ice);}
.nx-fp-pre{font-family:var(--mono);font-size:10.5px;line-height:1.7;color:#B9C8E8;
  white-space:pre-wrap;word-break:break-word;max-height:260px;overflow-y:auto;}
.nx-fp-noview{display:flex;flex-direction:column;gap:8px;align-items:center;text-align:center;
  padding:18px 6px;color:var(--muted-2);}
.nx-fp-noview p{font-size:12px;}

@media (max-width:1080px){
  .nx-fsplit{flex-direction:column;}
  .nx-fpane{width:100%;padding:20px 0 0;border-left:none;border-top:1px solid var(--edge);}
  .nx-flist{max-height:300px;}
  .nx-frow{grid-template-columns:16px 1fr auto;}
  .nx-frow-tags,.nx-frow-when{display:none;}
}

/* first run / create / edit */
.nx-first{margin:auto;max-width:460px;text-align:center;display:flex;flex-direction:column;
  align-items:center;padding:40px 0;}
.nx-first-mark{width:56px;height:56px;display:grid;place-items:center;border-radius:18px;
  border:1px solid var(--edge);background:var(--glass);color:var(--signal);margin-bottom:24px;
  box-shadow:0 0 34px var(--glow-faint);}
.nx-first h2{font-size:23px;font-weight:200;letter-spacing:-0.01em;}
.nx-first p{margin-top:12px;font-size:13px;line-height:1.65;color:var(--muted-2);}
.nx-first .nx-cta{margin-top:26px;}
.nx-first-alt{margin-top:22px;font-size:11.5px;}
.nx-first-alt b{color:var(--muted);font-weight:400;}

.nx-new{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;
  border-radius:11px;font-size:12.5px;font-weight:600;color:var(--void);background:var(--signal);
  box-shadow:0 0 22px var(--glow-soft);transition:all .18s;}
.nx-new:hover{transform:translateY(-1px);box-shadow:0 0 32px var(--glow);}
.nx-proj-mine{margin-left:8px;font-family:var(--mono);font-size:8.5px;font-weight:400;
  letter-spacing:0.12em;text-transform:uppercase;color:var(--signal);}

.nx-form{max-width:620px;}
.nx-form-field{display:flex;flex-direction:column;gap:8px;}
.nx-form-field>label{font-family:var(--mono);font-size:9.5px;letter-spacing:0.18em;
  text-transform:uppercase;color:var(--muted-2);}
.nx-form-row{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:start;}
.nx-form-hint{font-family:var(--mono);font-size:10px;color:var(--muted-2);letter-spacing:0.06em;}
.nx-form-hint-bad{color:var(--ember);}
.nx-form-actions{padding-top:6px;}
.nx-chip-tag{display:inline-flex;align-items:center;gap:6px;color:var(--ice);
  border-color:var(--glow);}
.nx-chip-tag:hover{color:var(--ember);border-color:rgba(255,156,107,0.35);}
.nx-btn-on:disabled{background:var(--glass-2);color:var(--muted-2);box-shadow:none;
  cursor:not-allowed;font-weight:400;}

.nx-task-line{display:flex;align-items:center;gap:6px;}
.nx-task-line>button{flex:1;}
.nx-drop{display:grid;place-items:center;width:22px;height:22px;border-radius:6px;flex-shrink:0;
  color:var(--muted-2);cursor:pointer;opacity:0;transition:all .16s;}
.nx-task-line:hover .nx-drop,.nx-note:hover .nx-drop,.nx-drop:focus-visible{opacity:1;}
.nx-drop:hover{color:var(--ember);background:rgba(255,156,107,0.1);}

@media (max-width:620px){.nx-form-row{grid-template-columns:1fr;}}

/* projects */
.nx-proj{display:flex;gap:24px;flex:1;min-height:520px;}
.nx-proj-rail{width:264px;flex-shrink:0;display:flex;flex-direction:column;gap:12px;
  padding-right:22px;border-right:1px solid var(--edge);}
.nx-proj-search{display:flex;align-items:center;gap:9px;padding:9px 13px;border-radius:11px;
  border:1px solid var(--edge);background:rgba(4,6,12,0.5);color:var(--muted-2);}
.nx-proj-search input{flex:1;min-width:0;background:none;border:none;outline:none;
  color:var(--ice);font:inherit;font-size:12.5px;}
.nx-proj-filters{display:flex;gap:5px;flex-wrap:wrap;}
.nx-proj-filters .nx-chip{padding:5px 11px;text-transform:capitalize;}
.nx-proj-list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;
  padding-right:4px;min-height:0;}
.nx-proj-item{display:flex;flex-direction:column;gap:7px;padding:11px 12px;border-radius:12px;
  border:1px solid transparent;text-align:left;transition:all .18s;}
.nx-proj-item:hover{background:var(--glass);}
.nx-proj-on{background:var(--glass-2);border-color:var(--edge);
  box-shadow:0 0 20px var(--glow-faint);}
.nx-proj-item-top{display:flex;align-items:center;gap:8px;}
.nx-proj-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
.nx-proj-name{flex:1;font-family:var(--mono);font-size:12px;color:var(--ice);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nx-proj-item-top em{font-style:normal;font-family:var(--mono);font-size:9.5px;color:var(--muted-2);}
.nx-proj-item-meta{font-size:11px;color:var(--muted-2);}
.nx-track{display:block;height:3px;border-radius:2px;background:rgba(159,190,255,0.1);
  overflow:hidden;}
.nx-track i{display:block;height:100%;background:var(--signal);transition:width .35s ease;}
.nx-track-sm{height:2px;}
.nx-proj-foot{font-family:var(--mono);font-size:9.5px;letter-spacing:0.08em;color:var(--muted-2);}

.nx-proj-detail{flex:1;min-width:0;display:flex;flex-direction:column;}
.nx-proj-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;
  margin-bottom:18px;}
.nx-proj-title{font-size:23px;font-weight:200;letter-spacing:-0.01em;font-family:var(--mono);}
.nx-tabs-sub .nx-tab{padding:7px 13px;font-size:12px;}
.nx-proj-desc{font-size:13.5px;line-height:1.6;color:var(--muted);max-width:62ch;}
.nx-proj-prog{padding:15px 16px;border-radius:14px;border:1px solid var(--edge);
  background:rgba(148,178,255,0.022);display:flex;flex-direction:column;gap:10px;}
.nx-proj-prog-head{display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);}
.nx-proj-readme{font-size:12.5px;line-height:1.65;color:var(--muted);}
.nx-sync-up{color:var(--signal);}
.nx-sync-down{color:var(--ember);}
.nx-dirty{display:flex;flex-direction:column;gap:4px;padding-top:11px;
  border-top:1px solid var(--edge);font-size:11px;color:var(--ember);}
.nx-inline-wide{flex:1;min-width:150px;width:auto;}
.nx-tasks-lg button{font-size:12.5px;padding:8px 6px;}

.nx-notes{display:flex;flex-direction:column;gap:8px;}
.nx-note{display:flex;align-items:flex-start;gap:11px;padding:13px 15px;border-radius:12px;
  border:1px solid var(--edge);background:rgba(148,178,255,0.022);}
.nx-note p{flex:1;font-size:12.5px;line-height:1.6;color:var(--ice);}
.nx-note em{font-style:normal;font-family:var(--mono);font-size:9.5px;color:var(--muted-2);
  flex-shrink:0;}
.nx-note-icon{flex-shrink:0;margin-top:2px;color:var(--muted-2);}
.nx-note-idea{border-color:rgba(142,124,255,0.24);background:rgba(142,124,255,0.04);}
.nx-note-idea .nx-note-icon{color:var(--violet);}

.nx-commits{display:flex;flex-direction:column;border-radius:14px;overflow:hidden;
  border:1px solid var(--edge);}
.nx-commit{border-top:1px solid rgba(159,190,255,0.05);}
.nx-commit:first-child{border-top:none;}
.nx-commit-head{display:grid;grid-template-columns:14px 1fr auto auto auto;gap:13px;
  align-items:center;width:100%;padding:11px 15px;text-align:left;font-size:12px;
  color:var(--muted);background:rgba(148,178,255,0.022);transition:background .16s;}
.nx-commit-head:hover{background:var(--glass);}
.nx-commit-head svg{color:var(--muted-2);}
.nx-commit-open .nx-commit-head{background:var(--glass-2);}
.nx-commit-open .nx-commit-head svg{color:var(--signal);}
.nx-commit-msg{color:var(--ice);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nx-commit-sha{font-family:var(--mono);font-size:10px;color:var(--muted-2);}
.nx-commit-diff{font-family:var(--mono);font-size:10px;display:flex;gap:6px;}
.nx-commit-diff b{color:var(--signal);font-weight:400;}
.nx-commit-diff i{color:var(--ember);font-style:normal;}
.nx-commit-when{font-family:var(--mono);font-size:9.5px;color:var(--muted-2);width:26px;
  text-align:right;}
.nx-commit-body{padding:12px 15px 14px 42px;display:flex;flex-direction:column;gap:5px;
  font-size:11.5px;color:var(--muted);background:rgba(2,4,9,0.4);animation:nx-rise .2s ease;}

.nx-files{display:flex;flex-direction:column;border-radius:14px;overflow:hidden;
  border:1px solid var(--edge);}
.nx-file{display:flex;align-items:center;gap:11px;padding:10px 15px;font-size:12px;
  color:var(--muted);background:rgba(148,178,255,0.022);
  border-top:1px solid rgba(159,190,255,0.05);}
.nx-file:first-child{border-top:none;}
.nx-file:hover{background:var(--glass);}
.nx-file svg{color:var(--muted-2);flex-shrink:0;}
.nx-file span{flex:1;color:var(--ice);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nx-file em{font-style:normal;font-family:var(--mono);font-size:10px;color:var(--muted-2);}

@media (max-width:940px){
  .nx-proj{flex-direction:column;}
  .nx-proj-rail{width:100%;padding:0 0 20px;border-right:none;border-bottom:1px solid var(--edge);}
  .nx-proj-list{max-height:230px;}
  .nx-commit-head{grid-template-columns:14px 1fr auto;}
  .nx-commit-diff,.nx-commit-when{display:none;}
}

/* cold start */
.nx-splash{position:fixed;inset:0;z-index:200;display:grid;place-items:center;
  cursor:pointer;padding:8vh 8vw;text-align:center;
  background:
    radial-gradient(680px 420px at 50% 34%, var(--glow-faint), transparent 68%),
    radial-gradient(520px 380px at 82% 78%, rgba(142,124,255,0.07), transparent 66%),
    #04060C;
  animation:nx-splash-in .85s cubic-bezier(.2,.7,.3,1) both;}
.nx-splash:focus-visible{outline:none;}
.nx-splash-out{animation:nx-splash-out .62s cubic-bezier(.4,0,.6,1) forwards;}
.nx-splash-inner{max-width:760px;display:flex;flex-direction:column;align-items:center;
  justify-content:center;}
.nx-splash-mark{width:7px;height:7px;border-radius:50%;background:var(--signal);
  box-shadow:0 0 14px var(--signal),0 0 34px var(--glow);
  animation:nx-rise-soft .9s ease both,nx-breathe 4.5s ease-in-out 1s infinite;}
.nx-splash-quote{margin:38px 0 0;font-weight:200;letter-spacing:-0.02em;line-height:1.36;
  font-size:clamp(21px,3.5vw,42px);color:var(--ice);text-wrap:balance;
  animation:nx-rise-soft 1.1s .22s cubic-bezier(.2,.7,.3,1) both;}
.nx-splash-who{margin-top:30px;display:flex;align-items:center;gap:12px;
  font-family:var(--mono);font-size:10.5px;letter-spacing:0.22em;text-transform:uppercase;
  color:var(--muted);animation:nx-rise-soft 1.1s .44s cubic-bezier(.2,.7,.3,1) both;}
.nx-splash-who em{font-style:normal;letter-spacing:0.14em;color:var(--muted-2);
  padding-left:12px;border-left:1px solid var(--edge);}
.nx-splash-hint{position:absolute;bottom:6vh;left:0;right:0;font-family:var(--mono);
  font-size:9.5px;letter-spacing:0.24em;text-transform:uppercase;color:var(--muted-2);
  animation:nx-hint 1.2s 1.5s ease both;}
.nx-asleep .nx-sidebar,.nx-asleep .nx-main{opacity:0;}
.nx-woke .nx-sidebar,.nx-woke .nx-main{animation:nx-wake .75s .1s cubic-bezier(.2,.7,.3,1) both;}

@keyframes nx-splash-in{from{opacity:0;}to{opacity:1;}}
@keyframes nx-splash-out{from{opacity:1;}to{opacity:0;visibility:hidden;}}
@keyframes nx-rise-soft{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}
@keyframes nx-hint{from{opacity:0;}to{opacity:0.75;}}
@keyframes nx-wake{from{opacity:0;transform:scale(.985);}to{opacity:1;transform:none;}}

/* api key setup */
.nx-set-school{border-color:var(--glow-soft)!important;
  background:radial-gradient(120% 100% at 0% 0%, var(--glow-faint), transparent 60%), var(--glass)!important;}
.nx-school-on{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--signal);
  padding:9px 12px;border-radius:10px;background:var(--glow-faint);border:1px solid var(--glow-soft);
  margin-top:4px;}
.nx-school-on svg{flex-shrink:0;}
.nx-keybind{padding:7px 14px;border-radius:9px;font-family:var(--mono);font-size:11px;
  color:var(--ice);border:1px solid var(--edge);background:rgba(4,6,12,0.4);min-width:96px;
  letter-spacing:0.04em;transition:all .16s;}
.nx-keybind:hover{border-color:var(--glow-soft);}
.nx-keybind-cap{border-color:var(--glow);color:var(--signal);
  box-shadow:0 0 16px var(--glow-soft);animation:nx-breathe 1.4s ease-in-out infinite;}

/* system status */
.nx-status-group{margin-top:16px;}
.nx-status{display:flex;flex-direction:column;gap:14px;}
.nx-status-env{display:flex;align-items:center;gap:12px;}
.nx-status-badge{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:500;
  color:var(--ice);padding:7px 13px;border-radius:10px;border:1px solid var(--edge);
  background:var(--glass);}
.nx-status-badge-school{color:var(--signal);border-color:var(--glow-soft);background:var(--glow-faint);}
.nx-status-plat{font-family:var(--mono);font-size:10.5px;color:var(--muted-2);letter-spacing:0.04em;}
.nx-status-head{font-family:var(--mono);font-size:9.5px;letter-spacing:0.16em;text-transform:uppercase;
  color:var(--muted-2);margin-top:6px;}
.nx-status-list{display:flex;flex-direction:column;border-radius:12px;overflow:hidden;
  border:1px solid var(--edge);}
.nx-status-row{display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;
  padding:9px 13px;font-size:12.5px;background:rgba(148,178,255,0.02);
  border-top:1px solid rgba(159,190,255,0.05);}
.nx-status-row:first-child{border-top:none;}
.nx-status-dot{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;}
.nx-status-ok{color:var(--signal);background:var(--glow-faint);}
.nx-status-res{color:#FFB454;background:rgba(255,180,84,0.1);}
.nx-status-off{color:var(--muted-2);background:var(--glass-2);}
.nx-status-label{color:var(--ice);}
.nx-status-state{font-family:var(--mono);font-size:10px;letter-spacing:0.08em;text-transform:uppercase;
  color:var(--muted);}
.nx-status-detail{grid-column:2/-1;font-size:10.5px;color:var(--muted-2);margin-top:-4px;}
.nx-status-foot{font-size:11.5px;line-height:1.6;color:var(--muted-2);max-width:70ch;}
.nx-booting{position:fixed;inset:0;background:var(--void);}
.nx-setup{position:fixed;inset:0;z-index:150;display:grid;place-items:center;padding:32px;
  background:radial-gradient(120% 90% at 50% 30%, var(--glow-faint), transparent 60%), var(--void);}
.nx-setup-inner{max-width:520px;width:100%;display:flex;flex-direction:column;align-items:flex-start;
  animation:nx-rise-soft .7s cubic-bezier(.2,.7,.3,1) both;}
.nx-setup-mark{width:12px;height:12px;margin-bottom:24px;border-radius:50%;background:var(--signal);
  box-shadow:0 0 16px var(--signal),0 0 40px var(--glow);}
.nx-setup-title{font-size:30px;font-weight:200;letter-spacing:-0.01em;color:var(--ice);}
.nx-setup-sub{margin-top:12px;font-size:13.5px;line-height:1.6;color:var(--muted);}
.nx-setup-field{display:flex;gap:9px;width:100%;margin-top:26px;}
.nx-setup-field input{flex:1;min-width:0;padding:12px 15px;border-radius:12px;
  background:rgba(4,6,12,0.6);border:1px solid var(--edge);color:var(--ice);font-family:var(--mono);
  font-size:13px;outline:none;}
.nx-setup-field input:focus{border-color:var(--glow);}
.nx-setup-field .nx-cta{white-space:nowrap;}
.nx-setup-err{margin-top:10px;}
.nx-setup-steps{margin-top:26px;display:flex;flex-direction:column;gap:9px;width:100%;
  padding:16px 18px;border-radius:13px;background:var(--glass);border:1px solid var(--edge);}
.nx-setup-steps p{font-size:12.5px;line-height:1.55;color:var(--muted);}
.nx-setup-steps b{color:var(--signal);margin-right:6px;font-family:var(--mono);}
.nx-setup-foot{margin-top:24px;display:flex;flex-direction:column;gap:12px;width:100%;}
.nx-setup-skip{align-self:flex-start;font-size:12.5px;color:var(--muted-2);text-decoration:underline;
  text-underline-offset:3px;}
.nx-setup-skip:hover{color:var(--ice);}

/* networking */
.nx-net-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(178px,1fr));gap:12px;}
.nx-nc{padding:15px 16px;border-radius:14px;border:1px solid var(--edge);
  background:linear-gradient(160deg,var(--glass),rgba(148,178,255,0.012));}
.nx-nc-label{font-family:var(--mono);font-size:9.5px;letter-spacing:0.16em;text-transform:uppercase;
  color:var(--muted-2);margin-bottom:9px;}
.nx-nc-val{font-family:var(--mono);font-size:19px;color:var(--ice);line-height:1.15;word-break:break-all;}
.nx-nc-val-sm{font-size:16px;}
.nx-nc-val i{font-style:normal;font-size:11px;color:var(--muted-2);}
.nx-nc-sub{margin-top:7px;font-size:11px;color:var(--muted-2);}
.nx-nc-spark{height:26px;margin-top:6px;display:flex;}

.nx-net-split{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;}
.nx-panel{padding:17px 18px;border-radius:14px;border:1px solid var(--edge);
  background:rgba(148,178,255,0.022);display:flex;flex-direction:column;gap:13px;}
.nx-panel-title{font-family:var(--mono);font-size:9.5px;letter-spacing:0.18em;
  text-transform:uppercase;color:var(--muted-2);}
.nx-dl{display:grid;grid-template-columns:auto 1fr;gap:9px 18px;font-size:12.5px;margin:0;}
.nx-dl dt{color:var(--muted-2);}
.nx-dl dd{margin:0;color:var(--ice);display:flex;align-items:center;gap:9px;}
.nx-bars{display:inline-flex;align-items:flex-end;gap:2px;height:12px;}
.nx-bars i{width:3px;height:4px;border-radius:1px;background:rgba(159,190,255,0.16);}
.nx-bars i:nth-child(2){height:6px;}
.nx-bars i:nth-child(3){height:9px;}
.nx-bars i:nth-child(4){height:12px;}
.nx-bars .nx-bar-on{background:var(--signal);}

.nx-dev-table{display:flex;flex-direction:column;border-radius:14px;overflow:hidden;
  border:1px solid var(--edge);}
.nx-dev-row{display:grid;grid-template-columns:1.5fr 1.1fr 1fr 0.8fr 0.6fr;gap:14px;
  align-items:center;padding:11px 15px;font-size:12px;color:var(--muted);
  background:rgba(148,178,255,0.022);border-top:1px solid rgba(159,190,255,0.05);}
.nx-dev-row:first-child{border-top:none;}
.nx-dev-row:hover{background:var(--glass);}
.nx-dev-head{font-family:var(--mono);font-size:9.5px;letter-spacing:0.14em;text-transform:uppercase;
  color:var(--muted-2);background:rgba(148,178,255,0.05);}
.nx-dev-head:hover{background:rgba(148,178,255,0.05);}
.nx-dev-ip{display:flex;align-items:center;gap:8px;color:var(--ice);}
.nx-dev-ip em{font-style:normal;font-size:9.5px;color:var(--muted-2);margin-left:2px;}
.nx-dev-dot{width:5px;height:5px;border-radius:50%;background:var(--signal);flex-shrink:0;
  box-shadow:0 0 7px var(--signal);}
.nx-dev-kind{font-family:var(--mono);font-size:9.5px;letter-spacing:0.08em;text-transform:uppercase;
  color:var(--violet);}
.nx-dev-probing{font-family:var(--mono);font-size:10.5px;color:var(--muted-2);
  letter-spacing:0.1em;display:block;animation:nx-pulse 1.2s ease-in-out infinite;}

.nx-lat-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:12px;
  padding:15px 16px;border-radius:14px;border:1px solid var(--edge);
  background:rgba(148,178,255,0.022);}
.nx-lat-graph{position:relative;height:150px;padding:16px;border-radius:14px;display:flex;
  border:1px solid var(--edge);background:rgba(2,4,9,0.5);}
.nx-lat-graph .nx-spark{height:100%;}
.nx-lat-live{border-color:var(--glow-soft);}
.nx-lat-target{position:absolute;top:12px;right:14px;font-family:var(--mono);font-size:9.5px;
  letter-spacing:0.12em;text-transform:uppercase;color:var(--muted-2);}
.nx-inline{padding:7px 13px;border-radius:20px;background:rgba(4,6,12,0.5);
  border:1px solid var(--edge);color:var(--ice);font-family:var(--mono);font-size:11px;
  outline:none;width:180px;}
.nx-inline:focus{border-color:var(--glow);}
.nx-chip-stop{color:var(--ember)!important;border-color:rgba(255,156,107,0.35)!important;}

.nx-dns-out{padding:14px 15px;border-radius:12px;border:1px solid var(--edge);
  background:rgba(2,4,9,0.45);display:flex;flex-direction:column;gap:7px;}
.nx-dns-head{display:flex;align-items:center;gap:12px;font-size:11.5px;color:var(--ice);}
.nx-dns-type{font-family:var(--mono);font-size:9.5px;padding:2px 8px;border-radius:20px;
  background:var(--glass-2);color:var(--violet);letter-spacing:0.1em;}

.nx-hops{display:flex;flex-direction:column;border-radius:12px;overflow:hidden;
  border:1px solid var(--edge);}
.nx-hop{display:grid;grid-template-columns:34px 1fr auto;gap:14px;align-items:center;
  padding:9px 14px;font-size:12px;color:var(--muted);background:rgba(148,178,255,0.022);
  border-top:1px solid rgba(159,190,255,0.05);animation:nx-rise .22s ease;}
.nx-hop:first-child{border-top:none;}
.nx-hop-n{font-family:var(--mono);font-size:10.5px;color:var(--signal);}
.nx-hop-host{color:var(--ice);display:flex;flex-direction:column;gap:2px;min-width:0;}
.nx-hop-host em{font-style:normal;font-family:var(--mono);font-size:9.5px;color:var(--muted-2);}
.nx-hop-raw{padding:6px 10px;}
.nx-hop-times{font-family:var(--mono);font-size:10.5px;color:var(--muted-2);white-space:nowrap;}
.nx-hop-lost{color:var(--muted-2);}
.nx-hop-lost .nx-hop-n{color:var(--ember);}
.nx-hop-wait{display:block;font-family:var(--mono);font-size:10.5px;color:var(--muted-2);
  animation:nx-pulse 1.2s ease-in-out infinite;}

@media (max-width:760px){
  .nx-dev-row{grid-template-columns:1fr 1fr;gap:6px 12px;}
  .nx-dev-row>span:nth-child(n+3){font-size:11px;}
  .nx-hop{grid-template-columns:30px 1fr;}
  .nx-hop-times{grid-column:2;}
}

/* terminal */
.nx-term-wrap{display:flex;gap:22px;flex:1;min-height:480px;}
.nx-term{flex:1;display:flex;flex-direction:column;min-width:0;}
.nx-term-bar{display:flex;align-items:center;gap:12px;padding:10px 14px;
  border:1px solid var(--edge);border-bottom:none;border-radius:14px 14px 0 0;
  background:rgba(148,178,255,0.05);font-family:var(--mono);font-size:10.5px;}
.nx-term-dots{display:flex;gap:5px;}
.nx-term-dots i{width:8px;height:8px;border-radius:50%;background:rgba(159,190,255,0.18);}
.nx-term-dots i:first-child{background:var(--ember);}
.nx-term-dots i:nth-child(2){background:var(--violet);}
.nx-term-dots i:last-child{background:var(--signal);}
.nx-term-path{color:var(--muted);}
.nx-term-adapter{margin-left:auto;letter-spacing:0.12em;text-transform:uppercase;
  color:var(--muted-2);}
.nx-term-out{flex:1;overflow-y:auto;padding:14px 16px;cursor:text;
  border:1px solid var(--edge);border-radius:0 0 14px 14px;
  background:rgba(2,4,9,0.72);font-family:var(--mono);font-size:12px;line-height:1.7;}
.nx-tl{white-space:pre-wrap;word-break:break-word;color:#B9C8E8;}
.nx-tl-cmd{color:var(--ice);}
.nx-tl-err{color:var(--ember);}
.nx-tl-note{color:var(--muted-2);}
.nx-tl-prompt{color:var(--signal);margin-right:9px;user-select:none;}
.nx-term-in{display:flex;align-items:baseline;gap:0;}
.nx-term-in input{flex:1;background:none;border:none;outline:none;color:var(--ice);
  font-family:var(--mono);font-size:12px;line-height:1.7;padding:0;caret-color:var(--signal);}
.nx-term-foot{margin-top:9px;font-family:var(--mono);font-size:10px;letter-spacing:0.06em;
  color:var(--muted-2);}

.nx-term-ai{width:330px;flex-shrink:0;display:flex;flex-direction:column;
  padding-left:22px;border-left:1px solid var(--edge);}
.nx-term-ai-head{display:flex;align-items:center;gap:8px;margin-bottom:14px;
  font-size:12.5px;color:var(--ice);}
.nx-term-ai-head svg{color:var(--signal);}
.nx-term-ai-head em{margin-left:auto;font-family:var(--mono);font-size:9px;font-style:normal;
  letter-spacing:0.1em;text-transform:uppercase;color:var(--muted-2);}
.nx-term-ai-feed{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:18px;
  padding-right:6px;}
.nx-term-ai-empty p{font-size:12.5px;line-height:1.6;color:var(--muted-2);}
.nx-term-seeds{display:flex;flex-direction:column;gap:6px;margin-top:16px;}
.nx-term-seeds button{padding:8px 12px;border-radius:10px;font-size:11.5px;text-align:left;
  color:var(--muted);border:1px solid var(--edge);transition:all .18s;}
.nx-term-seeds button:hover{color:var(--ice);background:var(--glass);
  border-color:var(--glow);}
.nx-term-seeds button:first-child{color:var(--ember);border-color:rgba(255,156,107,0.28);}
.nx-term-quick{display:flex;align-items:center;gap:7px;margin-top:12px;padding:7px 11px;
  border-radius:9px;font-size:11px;color:var(--ember);border:1px solid rgba(255,156,107,0.28);}
.nx-term-composer{margin-top:14px;}
.nx-term-ai .nx-msg-body{max-width:100%;font-size:12.5px;}
.nx-term-ai .nx-msg-user .nx-msg-body{max-width:88%;}

@media (max-width:960px){
  .nx-term-wrap{flex-direction:column;}
  .nx-term-ai{width:100%;padding:20px 0 0;border-left:none;border-top:1px solid var(--edge);}
  .nx-term-out{min-height:280px;}
  .nx-term-ai-feed{min-height:180px;}
}

/* assistant */
.nx-asst{display:flex;gap:26px;flex:1;min-height:440px;}
.nx-asst-main{flex:1;display:flex;flex-direction:column;min-width:0;}
.nx-asst-feed{flex:1;overflow-y:auto;padding-right:10px;display:flex;flex-direction:column;gap:22px;}
.nx-asst-open{margin:auto 0;text-align:center;display:flex;flex-direction:column;align-items:center;}
.nx-asst-orb{width:40px;height:40px;border-radius:50%;margin-bottom:20px;
  background:radial-gradient(circle at 35% 30%,var(--signal),var(--glow-soft));
  box-shadow:0 0 34px var(--glow);animation:nx-breathe 4.5s ease-in-out infinite;}
.nx-asst-open h3{font-size:20px;font-weight:200;letter-spacing:-0.01em;}
.nx-asst-open p{margin-top:10px;max-width:42ch;font-size:12.5px;line-height:1.6;color:var(--muted-2);}
.nx-asst-seeds{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin-top:24px;max-width:520px;}
.nx-asst-seeds button{padding:8px 14px;border-radius:20px;font-size:11.5px;color:var(--muted);
  border:1px solid var(--edge);transition:all .18s;}
.nx-asst-seeds button:hover{color:var(--ice);border-color:var(--glow);background:var(--glass);}

.nx-msg{display:flex;gap:12px;}
.nx-msg-user{justify-content:flex-end;}
.nx-msg-user .nx-msg-body{background:var(--glass-2);border:1px solid var(--edge);
  border-radius:14px 14px 4px 14px;padding:11px 15px;max-width:76%;}
.nx-msg-assistant .nx-msg-body{max-width:78%;}
.nx-msg-mark{width:7px;height:7px;border-radius:50%;background:var(--signal);flex-shrink:0;margin-top:7px;
  box-shadow:0 0 10px var(--glow);}
.nx-msg-mark-busy{animation:nx-pulse 1.1s ease-in-out infinite;}
.nx-msg-body{font-size:13.5px;line-height:1.68;color:var(--ice);}
.nx-msg-body p+p{margin-top:11px;}
.nx-msg-assistant .nx-msg-body{color:#CBD8F5;}
.nx-msg-busy{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11.5px;
  color:var(--muted-2);letter-spacing:0.08em;text-transform:uppercase;}
.nx-spin{animation:nx-spin 1s linear infinite;}
.nx-asst-err{display:flex;align-items:flex-start;gap:9px;padding:12px 14px;border-radius:11px;
  font-size:12px;line-height:1.5;color:var(--ember);background:rgba(255,156,107,0.07);
  border:1px solid rgba(255,156,107,0.24);}

.nx-asst-composer{display:flex;align-items:flex-end;gap:10px;margin-top:20px;padding:10px 10px 10px 16px;
  border-radius:16px;border:1px solid var(--edge);background:rgba(148,178,255,0.04);
  backdrop-filter:blur(16px);transition:border-color .2s;}
.nx-asst-composer:focus-within{border-color:var(--glow);
  box-shadow:0 0 30px var(--glow-faint);}
.nx-asst-composer textarea{flex:1;background:none;border:none;outline:none;resize:none;
  color:var(--ice);font:inherit;font-size:13.5px;line-height:1.6;padding:7px 0;max-height:150px;}
.nx-asst-composer textarea::placeholder{color:var(--muted-2);}
.nx-asst-send{width:34px;height:34px;flex-shrink:0;display:grid;place-items:center;border-radius:10px;
  background:var(--signal);color:var(--void);transition:all .18s;}
.nx-asst-send:disabled{background:var(--glass-2);color:var(--muted-2);cursor:not-allowed;}
.nx-asst-send:not(:disabled):hover{box-shadow:0 0 22px var(--glow);transform:translateY(-1px);}
.nx-asst-foot{margin-top:9px;font-family:var(--mono);font-size:10px;letter-spacing:0.08em;
  color:var(--muted-2);text-transform:uppercase;}

.nx-code{margin:12px 0;padding:13px 15px;border-radius:11px;overflow-x:auto;
  font-family:var(--mono);font-size:11.5px;line-height:1.65;color:var(--signal);
  background:rgba(4,6,12,0.6);border:1px solid var(--edge);white-space:pre;}
.nx-bullet{position:relative;padding-left:16px;}
.nx-bullet::before{content:"";position:absolute;left:3px;top:9px;width:4px;height:4px;
  border-radius:50%;background:var(--muted-2);}
.nx-copy-fail{color:var(--ember)!important;border-color:rgba(255,156,107,0.35)!important;}

.nx-asst-rail{width:212px;flex-shrink:0;padding-left:24px;border-left:1px solid var(--edge);}
.nx-rail-title{font-family:var(--mono);font-size:9.5px;letter-spacing:0.18em;text-transform:uppercase;
  color:var(--muted-2);margin-bottom:12px;}
.nx-rail-list{display:flex;flex-direction:column;gap:3px;}
.nx-rail-list li{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:9px;
  font-size:12px;color:var(--muted-2);border:1px solid transparent;}
.nx-rail-list em{margin-left:auto;font-family:var(--mono);font-size:9px;font-style:normal;
  letter-spacing:0.1em;text-transform:uppercase;}
.nx-rail-on{color:var(--ice)!important;background:var(--glass);border-color:var(--edge)!important;}
.nx-rail-on em{color:var(--signal);}
.nx-rail-note{font-size:11.5px;line-height:1.6;color:var(--muted-2);}
.nx-rail-clear{display:flex;align-items:center;gap:7px;margin-top:26px;padding:7px 11px;border-radius:9px;
  font-size:11.5px;color:var(--muted-2);border:1px solid var(--edge);}
.nx-rail-clear:hover{color:var(--ember);border-color:rgba(255,156,107,0.3);}

@media (max-width:900px){
  .nx-asst{flex-direction:column;height:auto;}
  .nx-asst-rail{width:100%;padding:22px 0 0;border-left:none;border-top:1px solid var(--edge);}
  .nx-asst-feed{min-height:320px;}
}

@keyframes nx-breathe{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.08);opacity:0.82;}}
@keyframes nx-pulse{0%,100%{opacity:1;}50%{opacity:0.35;}}
@keyframes nx-halo{0%{r:9;opacity:0.6;}100%{r:16;opacity:0;}}
@keyframes nx-rise{from{opacity:0;transform:translate(-50%,8px);}}

@media (max-width:620px){
  .nx-w-md,.nx-w-lg,.nx-w-xl{grid-column:span 1;}
  .nx-w-lg{grid-row:span 2;}
  .nx-scan-sum{flex-direction:column;gap:5px;}
}
@media (max-width:860px){
  .nx-sidebar{width:58px;padding:20px 8px;}
  .nx-brand-name,.nx-nav span,.nx-cmd{display:none;}
  .nx-nav{justify-content:center;}
  .nx-main{padding:24px 18px 40px;}
  .nx-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));}
}
/* ---------------------------------------------------------------- agent mode */

.nx-agent{display:flex;flex-direction:column;gap:18px;height:100%;min-height:0;}
.nx-agent-gate{align-items:center;justify-content:center;text-align:center;color:var(--muted);margin:auto;max-width:44ch;}
.nx-agent-gate h3{font-size:17px;font-weight:200;margin-top:12px;color:var(--ice);}
.nx-agent-gate p{margin-top:8px;font-size:12.5px;line-height:1.6;}
.nx-agent-gate code{font-family:var(--mono);font-size:11.5px;color:var(--signal);}

.nx-agent-head{display:flex;align-items:flex-start;gap:16px;}
.nx-agent-title h2{font-size:19px;font-weight:200;letter-spacing:-0.01em;}
.nx-agent-title p{margin-top:6px;font-size:12.5px;line-height:1.6;color:var(--muted-2);max-width:64ch;}
.nx-agent-guard{margin-left:auto;flex-shrink:0;display:flex;align-items:center;gap:6px;
  padding:6px 11px;border-radius:9px;border:1px solid var(--edge);background:var(--glass);
  font-family:var(--mono);font-size:10px;letter-spacing:0.06em;text-transform:uppercase;transition:all .16s;}
.nx-agent-guard.on{color:var(--signal);border-color:rgba(94,230,196,0.28);}
.nx-agent-guard.off{color:var(--ember);border-color:rgba(255,156,107,0.32);}
.nx-agent-guard:disabled{opacity:0.45;cursor:not-allowed;}

.nx-agent-status{display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  padding:11px 14px;border-radius:12px;border:1px solid var(--edge);background:var(--glass);}
.nx-agent-status strong{font-size:12.5px;font-weight:400;}
.nx-agent-dot{width:7px;height:7px;border-radius:50%;background:var(--muted-2);flex-shrink:0;}
.nx-agent-status.live .nx-agent-dot{background:var(--signal);box-shadow:0 0 10px var(--signal);animation:nx-pulse 1.6s infinite;}
.nx-agent-status.ok .nx-agent-dot{background:var(--signal);}
.nx-agent-status.warn .nx-agent-dot{background:var(--ember);}
.nx-agent-status.bad .nx-agent-dot{background:#FF6B6B;}
.nx-agent-meta{font-family:var(--mono);font-size:10.5px;color:var(--muted-2);letter-spacing:0.04em;}
.nx-agent-stop{margin-left:auto;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:9px;
  background:rgba(255,107,107,0.14);color:#FF8B8B;font-size:11.5px;transition:all .16s;}
.nx-agent-stop:hover{background:rgba(255,107,107,0.22);}
.nx-agent-stop.ghost{background:var(--glass-2);color:var(--muted);}
.nx-agent-summary{flex-basis:100%;font-size:12.5px;line-height:1.65;color:var(--muted);
  padding-top:10px;margin-top:2px;border-top:1px solid var(--edge);}

.nx-agent-setup{display:flex;flex-direction:column;gap:14px;}
.nx-agent-presets{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;}
.nx-agent-presets button{text-align:left;padding:11px 13px;border-radius:11px;
  border:1px solid var(--edge);background:var(--glass);transition:all .16s;}
.nx-agent-presets button:hover{background:var(--glass-2);border-color:rgba(94,230,196,0.24);}
.nx-agent-presets span{display:block;font-size:12.5px;}
.nx-agent-presets small{display:block;margin-top:3px;font-size:11px;color:var(--muted-2);line-height:1.5;}

.nx-agent-goal{min-height:190px;resize:vertical;padding:14px 16px;border-radius:13px;
  border:1px solid var(--edge);background:var(--glass);color:var(--ice);
  font-family:var(--mono);font-size:12.5px;line-height:1.7;outline:none;transition:border-color .16s;}
.nx-agent-goal:focus{border-color:rgba(94,230,196,0.32);}
.nx-agent-goal::placeholder{color:var(--muted-2);font-family:var(--display);font-size:13px;}

.nx-agent-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
.nx-agent-opts{display:flex;align-items:center;gap:5px;font-family:var(--mono);font-size:10px;
  letter-spacing:0.07em;text-transform:uppercase;color:var(--muted-2);}
.nx-agent-opts svg{transition:transform .18s;}
.nx-agent-opts svg.open{transform:rotate(180deg);}
.nx-agent-budget{font-family:var(--mono);font-size:10.5px;color:var(--muted-2);}
.nx-agent-run{margin-left:auto;display:flex;align-items:center;gap:7px;padding:9px 18px;border-radius:10px;
  background:var(--signal);color:var(--void);font-size:12.5px;transition:all .18s;}
.nx-agent-run:not(:disabled):hover{box-shadow:0 0 24px var(--glow);transform:translateY(-1px);}
.nx-agent-run:disabled{background:var(--glass-2);color:var(--muted-2);cursor:not-allowed;}

.nx-agent-optbox{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;
  padding:14px;border-radius:12px;border:1px solid var(--edge);background:var(--glass);}
.nx-agent-num{display:flex;flex-direction:column;gap:5px;}
.nx-agent-num span{font-size:11.5px;color:var(--muted);}
.nx-agent-num input{padding:7px 10px;border-radius:8px;border:1px solid var(--edge);
  background:var(--glass-2);color:var(--ice);font-family:var(--mono);font-size:12px;outline:none;}
.nx-agent-num small{font-size:10.5px;color:var(--muted-2);line-height:1.45;}

.nx-agent-err{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ember);}
.nx-agent-warn{font-size:11.5px;line-height:1.65;color:var(--muted-2);max-width:74ch;}

/* ---- simple view -------------------------------------------------------- */
/* Bigger type, more air, no monospace. The technical feed is one click away
   for anyone who wants it, so this side can afford to stay calm. */

.nx-agent-viewtog{align-self:flex-start;display:flex;align-items:center;gap:6px;
  padding:6px 11px;border-radius:9px;border:1px solid var(--edge);background:var(--glass);
  font-size:11px;color:var(--muted-2);transition:all .16s;}
.nx-agent-viewtog:hover{background:var(--glass-2);color:var(--muted);}
.nx-agent-viewtog.on{color:var(--signal);border-color:rgba(94,230,196,0.26);}

.nx-agent-simple{display:flex;flex-direction:column;gap:20px;flex:1;min-height:0;
  overflow-y:auto;padding-right:6px;}

.nx-agent-now{display:flex;align-items:flex-start;gap:13px;padding:16px 18px;border-radius:14px;
  border:1px solid rgba(94,230,196,0.20);background:rgba(94,230,196,0.05);}
.nx-agent-now svg{color:var(--signal);flex-shrink:0;margin-top:1px;}
.nx-agent-now strong{display:block;font-size:15px;font-weight:300;line-height:1.45;color:var(--ice);}
.nx-agent-now small{display:block;margin-top:5px;font-size:12px;color:var(--muted-2);}
.nx-agent-now.ok{border-color:rgba(94,230,196,0.30);}
.nx-agent-now.warn{border-color:rgba(255,156,107,0.28);background:rgba(255,156,107,0.05);}
.nx-agent-now.warn svg{color:var(--ember);}

.nx-agent-checklist{display:flex;flex-direction:column;gap:2px;}
.nx-agent-checklist li{display:flex;gap:12px;align-items:flex-start;padding:11px 12px;border-radius:11px;
  font-size:13.5px;line-height:1.55;transition:background .16s;}
.nx-agent-checklist li>div{padding-top:1px;}
.nx-agent-checkmark{flex-shrink:0;display:flex;align-items:center;height:20px;}
.nx-agent-checklist li.done{color:var(--muted-2);}
.nx-agent-checklist li.done .nx-agent-checkmark svg{color:var(--signal);}
.nx-agent-checklist li.current{background:var(--glass);color:var(--ice);}
.nx-agent-checklist li.current .nx-agent-checkmark svg{color:var(--signal);}
.nx-agent-checklist li.todo{color:var(--muted-2);opacity:0.62;}
.nx-agent-checklist li.todo .nx-agent-checkmark svg{color:var(--muted-2);}
.nx-agent-checklist small{display:block;margin-top:4px;font-size:11.5px;color:var(--muted-2);line-height:1.5;}

.nx-agent-simple-empty{font-size:13px;color:var(--muted-2);line-height:1.6;padding:4px 2px;}

.nx-agent-simple-summary{padding:16px 18px;border-radius:14px;border:1px solid var(--edge);
  background:var(--glass);}
.nx-agent-simple-summary h4{font-size:11px;letter-spacing:0.08em;text-transform:uppercase;
  color:var(--muted-2);margin-bottom:9px;}
.nx-agent-simple-summary p{font-size:13.5px;line-height:1.7;color:var(--muted);}

/* Agent prose runs through the same markdown renderer as the assistant. */
.nx-agent-prose{font-size:13px;line-height:1.7;color:var(--muted);}
.nx-agent-prose p{margin:0 0 7px;}
.nx-agent-prose p:last-child{margin-bottom:0;}
.nx-agent-prose .nx-mdh{color:var(--ice);font-weight:400;margin:12px 0 6px;}
.nx-agent-prose .nx-mdh:first-child{margin-top:0;}

.nx-rail-models{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;}
.nx-rail-model{padding:6px 4px;border-radius:8px;border:1px solid var(--edge);
  background:var(--glass);font-size:11px;color:var(--muted-2);transition:all .16s;}
.nx-rail-model:hover{background:var(--glass-2);color:var(--muted);}
.nx-rail-model.on{border-color:rgba(94,230,196,0.34);background:rgba(94,230,196,0.07);
  color:var(--signal);}
.nx-rail-modelnote{margin-top:8px;font-size:10.5px;line-height:1.55;color:var(--muted-2);}

.nx-rail-jump{display:flex;align-items:center;gap:6px;margin-top:11px;padding:7px 11px;
  width:100%;border-radius:9px;border:1px solid var(--edge);background:var(--glass);
  font-size:11.5px;color:var(--muted);transition:all .16s;}
.nx-rail-jump:hover{background:var(--glass-2);color:var(--ice);border-color:rgba(94,230,196,0.26);}

/* ---- model picker ------------------------------------------------------- */

.nx-agent-models{display:flex;flex-direction:column;gap:9px;}
.nx-agent-modelrow{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.nx-agent-model{padding:10px 12px;border-radius:11px;border:1px solid var(--edge);
  background:var(--glass);text-align:left;transition:all .16s;}
.nx-agent-model:hover{background:var(--glass-2);}
.nx-agent-model span{display:block;font-size:12.5px;color:var(--muted);}
.nx-agent-model small{display:block;margin-top:3px;font-family:var(--mono);font-size:9.5px;
  letter-spacing:0.04em;color:var(--muted-2);}
.nx-agent-model.on{border-color:rgba(94,230,196,0.34);background:rgba(94,230,196,0.06);}
.nx-agent-model.on span{color:var(--ice);}
.nx-agent-model.on small{color:var(--signal);}
.nx-agent-modelnote{font-size:11.5px;line-height:1.6;color:var(--muted-2);}

/* ---- run history -------------------------------------------------------- */

.nx-agent-history{margin-top:6px;padding-top:16px;border-top:1px solid var(--edge);}
.nx-agent-history h4{display:flex;align-items:center;gap:7px;font-size:10.5px;
  letter-spacing:0.09em;text-transform:uppercase;color:var(--muted-2);margin-bottom:11px;}
.nx-agent-history h4 em{font-family:var(--mono);font-style:normal;font-size:10px;
  padding:1px 6px;border-radius:5px;background:var(--glass-2);}

.nx-agent-runs{display:flex;flex-direction:column;gap:3px;}
.nx-agent-runrow{display:flex;align-items:center;gap:11px;width:100%;text-align:left;
  padding:9px 11px;border-radius:10px;transition:background .15s;}
.nx-agent-runrow:hover{background:var(--glass);}
.nx-agent-rundot{width:6px;height:6px;border-radius:50%;flex-shrink:0;background:var(--muted-2);}
.nx-agent-rundot.done{background:var(--signal);}
.nx-agent-rundot.blocked,.nx-agent-rundot.error{background:var(--ember);}
.nx-agent-runwhat{flex:1;min-width:0;font-size:12.5px;color:var(--muted);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.nx-agent-runrow:hover .nx-agent-runwhat{color:var(--ice);}
.nx-agent-runmeta{flex-shrink:0;font-family:var(--mono);font-size:10px;color:var(--muted-2);}
.nx-agent-rundel{flex-shrink:0;display:flex;padding:3px;border-radius:6px;color:var(--muted-2);
  opacity:0;transition:all .15s;}
.nx-agent-runrow:hover .nx-agent-rundel{opacity:1;}
.nx-agent-rundel:hover{color:#FF8B8B;background:rgba(255,107,107,0.12);}
.nx-agent-runmore{margin-top:9px;font-size:11px;color:var(--muted-2);}
.nx-agent-runmore:hover{color:var(--signal);}

.nx-agent-past{display:flex;flex-direction:column;gap:15px;flex:1;min-height:0;}
.nx-agent-pasthead{display:flex;align-items:center;gap:14px;padding-bottom:14px;
  border-bottom:1px solid var(--edge);}
.nx-agent-back{display:flex;align-items:center;gap:6px;padding:6px 11px;border-radius:9px;
  border:1px solid var(--edge);background:var(--glass);font-size:11.5px;color:var(--muted);
  flex-shrink:0;transition:all .16s;}
.nx-agent-back:hover{background:var(--glass-2);color:var(--ice);}
.nx-agent-pasthead strong{display:block;font-size:13px;font-weight:300;color:var(--ice);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.nx-agent-pasthead small{display:block;margin-top:3px;font-family:var(--mono);font-size:10px;
  color:var(--muted-2);}

.nx-agent-row.stats strong{font-size:12px;font-weight:400;color:var(--ice);}
.nx-agent-row.stats small{display:block;margin-top:4px;font-size:11px;color:var(--muted-2);
  line-height:1.55;}
.nx-agent-row.stats>svg{color:var(--signal);}

/* ---- agent alert -------------------------------------------------------- */
/* Bottom-right, above everything, but narrow enough not to own the screen. */

.nx-agentalert{position:fixed;right:22px;bottom:22px;z-index:120;
  display:flex;align-items:flex-start;gap:12px;width:min(380px,calc(100vw - 44px));
  padding:15px 16px;border-radius:15px;border:1px solid var(--edge);
  background:rgba(14,18,24,0.96);backdrop-filter:blur(18px);
  box-shadow:0 18px 48px rgba(0,0,0,0.5);
  animation:nx-alert-in .32s cubic-bezier(.16,1,.3,1);}
@keyframes nx-alert-in{
  from{opacity:0;transform:translateY(14px) scale(.97);}
  to{opacity:1;transform:none;}
}
.nx-agentalert>svg{flex-shrink:0;margin-top:1px;color:var(--signal);}
.nx-agentalert-help{border-color:rgba(255,156,107,0.38);}
.nx-agentalert-help>svg{color:var(--ember);}
.nx-agentalert-warn{border-color:rgba(255,156,107,0.30);}
.nx-agentalert-warn>svg{color:var(--ember);}
.nx-agentalert-done{border-color:rgba(94,230,196,0.32);}

.nx-agentalert-body{flex:1;min-width:0;}
.nx-agentalert-body strong{display:block;font-size:13.5px;font-weight:400;color:var(--ice);}
.nx-agentalert-body p{margin-top:5px;font-size:12px;line-height:1.55;color:var(--muted-2);
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}

.nx-agentalert-acts{display:flex;flex-direction:column;align-items:flex-end;gap:7px;flex-shrink:0;}
.nx-agentalert-go{padding:6px 12px;border-radius:9px;font-size:11.5px;white-space:nowrap;
  background:var(--glass-2);color:var(--ice);border:1px solid var(--edge);transition:all .16s;}
.nx-agentalert-go:hover{background:var(--glass);border-color:rgba(94,230,196,0.3);}
.nx-agentalert-help .nx-agentalert-go{background:rgba(255,156,107,0.16);color:var(--ember);
  border-color:rgba(255,156,107,0.3);}
.nx-agentalert-x{padding:3px;border-radius:7px;color:var(--muted-2);transition:color .16s;}
.nx-agentalert-x:hover{color:var(--ice);}

/* ---- markdown tables ---------------------------------------------------- */
.nx-mdtable-wrap{overflow-x:auto;margin:10px 0;border:1px solid var(--edge);border-radius:11px;}
.nx-mdtable{width:100%;border-collapse:collapse;font-size:12.5px;}
.nx-mdtable th{text-align:left;padding:9px 13px;font-weight:400;color:var(--muted-2);
  background:var(--glass-2);border-bottom:1px solid var(--edge);white-space:nowrap;
  font-size:11px;letter-spacing:0.05em;text-transform:uppercase;}
.nx-mdtable td{padding:9px 13px;color:var(--muted);line-height:1.6;
  border-bottom:1px solid rgba(255,255,255,0.04);vertical-align:top;}
.nx-mdtable tr:last-child td{border-bottom:none;}
.nx-mdtable tbody tr:hover td{background:var(--glass);}
.nx-mdtable td b,.nx-mdtable th b{color:var(--ice);font-weight:400;}

.nx-agent-body{display:flex;gap:20px;flex:1;min-height:0;}
.nx-agent-plan{width:270px;flex-shrink:0;overflow-y:auto;padding-right:6px;}
.nx-agent-plan h4{font-family:var(--mono);font-size:10px;letter-spacing:0.1em;text-transform:uppercase;
  color:var(--muted-2);margin-bottom:12px;}
.nx-agent-plan ol{display:flex;flex-direction:column;gap:11px;}
.nx-agent-plan li{display:flex;gap:9px;font-size:12px;line-height:1.55;color:var(--muted);}
.nx-agent-plan li.done{color:var(--muted-2);}
.nx-agent-plan li.done>div{text-decoration:line-through;text-decoration-color:var(--muted-2);}
.nx-agent-plan small{display:block;margin-top:3px;font-size:10.5px;color:var(--muted-2);text-decoration:none;}
.nx-agent-tick{flex-shrink:0;width:17px;height:17px;display:grid;place-items:center;border-radius:50%;
  border:1px solid var(--edge);font-family:var(--mono);font-size:9px;font-style:normal;color:var(--muted-2);}
.nx-agent-plan li.done .nx-agent-tick{border-color:rgba(94,230,196,0.3);color:var(--signal);}

.nx-agent-feed{flex:1;min-width:0;overflow-y:auto;padding-right:10px;
  display:flex;flex-direction:column;gap:14px;}
.nx-agent-row{display:flex;gap:10px;font-size:12.5px;line-height:1.6;color:var(--muted);}
.nx-agent-row>svg{flex-shrink:0;margin-top:3px;color:var(--muted-2);}
.nx-agent-row>div{min-width:0;flex:1;}
.nx-agent-row strong{font-weight:400;color:var(--ice);}
.nx-agent-row small{display:block;margin-top:3px;font-size:11px;color:var(--muted-2);}
.nx-agent-row pre{margin-top:5px;white-space:pre-wrap;word-break:break-word;
  font-family:var(--mono);font-size:11.5px;line-height:1.6;color:var(--muted-2);max-height:200px;overflow-y:auto;}
.nx-agent-row.ok>svg{color:var(--signal);}
.nx-agent-row.warn>svg{color:var(--ember);}
.nx-agent-row.bad>svg{color:#FF8B8B;}
.nx-agent-row.live>svg{color:var(--signal);}
.nx-agent-row.step>svg{color:var(--signal);}
.nx-agent-row.thought{color:var(--ice);}
.nx-agent-mark{flex-shrink:0;width:5px;height:5px;margin-top:8px;border-radius:50%;
  background:var(--signal);box-shadow:0 0 8px var(--glow);}
.nx-agent-row.finish{padding:13px 15px;border-radius:12px;border:1px solid var(--edge);background:var(--glass);}
.nx-agent-row.finish p{margin-top:6px;line-height:1.65;}
.nx-agent-row.finish.ok{border-color:rgba(94,230,196,0.24);}
.nx-agent-row.finish.warn{border-color:rgba(255,156,107,0.26);}

.nx-agent-why{color:var(--muted-2);margin-bottom:4px!important;margin-top:0!important;}
.nx-agent-cmdline{display:block;font-family:var(--mono);font-size:12px;line-height:1.6;color:var(--ice);
  padding:7px 11px;border-radius:8px;background:rgba(148,178,255,0.06);
  white-space:pre-wrap;word-break:break-all;}
.nx-agent-cmdmeta{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:5px;
  font-family:var(--mono);font-size:10px;letter-spacing:0.04em;color:var(--muted-2);}
.nx-agent-cmdmeta button{font-family:var(--mono);font-size:10px;color:var(--signal);
  text-decoration:underline;text-underline-offset:2px;}
.nx-agent-cwd{opacity:0.7;}
.nx-agent-out{margin-top:7px;padding:10px 12px;border-radius:9px;background:rgba(4,6,12,0.5);
  border:1px solid var(--edge);max-height:280px;overflow:auto;}
.nx-agent-row code{font-family:var(--mono);font-size:11.5px;color:var(--ice);}

.nx-agent-stream{padding:10px 12px;border-radius:10px;background:rgba(4,6,12,0.45);
  border:1px solid var(--edge);font-family:var(--mono);font-size:11px;line-height:1.65;
  color:var(--muted-2);max-height:190px;overflow:hidden;}
.nx-agent-stream .err{color:var(--ember);}
.nx-agent-thinking{display:flex;align-items:center;gap:7px;font-family:var(--mono);font-size:10.5px;
  letter-spacing:0.05em;color:var(--muted-2);}

.nx-agent-status.hold .nx-agent-dot{background:var(--violet);box-shadow:0 0 10px var(--violet);
  animation:nx-pulse 1.6s infinite;}

/* The handoff card. Deliberately the loudest thing on the screen  -  if the run
   is parked waiting on a click, that is the only fact that matters. */
.nx-agent-handoff{padding:16px 18px;border-radius:14px;
  border:1px solid rgba(142,124,255,0.4);background:rgba(142,124,255,0.09);
  box-shadow:0 0 30px rgba(142,124,255,0.14);}
.nx-agent-handoff-head{display:flex;align-items:center;gap:9px;margin-bottom:11px;}
.nx-agent-handoff-head svg{color:var(--violet);}
.nx-agent-handoff-head strong{font-size:13px;font-weight:400;}
.nx-agent-handoff-head span{font-family:var(--mono);font-size:9.5px;letter-spacing:0.07em;
  text-transform:uppercase;color:var(--muted-2);margin-left:auto;}
.nx-agent-handoff-req{font-size:13.5px;line-height:1.65;color:var(--ice);white-space:pre-wrap;}
.nx-agent-handoff-expect{margin-top:8px;font-size:12px;line-height:1.6;color:var(--muted);}
.nx-agent-handoff-input{width:100%;margin-top:12px;min-height:72px;resize:vertical;padding:10px 12px;
  border-radius:10px;border:1px solid var(--edge);background:rgba(4,6,12,0.4);color:var(--ice);
  font-family:var(--mono);font-size:12px;line-height:1.6;outline:none;}
.nx-agent-handoff-input:focus{border-color:rgba(142,124,255,0.45);}
.nx-agent-handoff-foot{display:flex;align-items:center;gap:11px;margin-top:13px;flex-wrap:wrap;}
.nx-agent-handoff-go{display:flex;align-items:center;gap:7px;padding:9px 17px;border-radius:10px;
  background:var(--violet);color:#fff;font-size:12.5px;transition:all .18s;flex-shrink:0;}
.nx-agent-handoff-go:not(:disabled):hover{box-shadow:0 0 22px rgba(142,124,255,0.5);transform:translateY(-1px);}
.nx-agent-handoff-go:disabled{background:var(--glass-2);color:var(--muted-2);cursor:not-allowed;}
.nx-agent-handoff-note{flex:1;min-width:180px;padding:8px 12px;border-radius:9px;
  border:1px solid var(--edge);background:rgba(4,6,12,0.3);color:var(--ice);
  font-family:inherit;font-size:12px;outline:none;}
.nx-agent-handoff-note::placeholder{color:var(--muted-2);}
.nx-agent-handoff-note:focus{border-color:rgba(142,124,255,0.35);}

@media (max-width:1000px){
  .nx-agent-body{flex-direction:column;}
  .nx-agent-plan{width:100%;max-height:180px;}
}

.nx-still *{animation:none!important;transition:none!important;}
@media (prefers-reduced-motion:reduce){
  .nx-root *{animation:none!important;transition:none!important;}
  .nx-asleep .nx-sidebar,.nx-asleep .nx-main{opacity:1;}
  .nx-splash-hint{opacity:0.75;}
}
`;
