
const inTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

function invoke(cmd, args) {
  if (!inTauri) return Promise.reject(new Error("Agent Mode needs the desktop app."));
  const fn = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  return fn(cmd, args);
}

export const DEFAULTS = {
  maxSteps: 80,          // model turns, not commands  -  one turn can run several
  maxMinutes: 90,        // wall clock, excluding time spent waiting on the user
  commandTimeout: 3600,  // absolute ceiling per command
  commandQuiet: 120,     // kill a command after this long with no output at all
  contextBudget: 120_000, // approx chars of transcript before compaction kicks in
  model: "claude-sonnet-4-6",
};

export const MODELS = [
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku",
    blurb: "Fastest and cheapest. Good for installs, downloads, file wrangling and other routine jobs.",
    rate: { in: 1, out: 5 },
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet",
    blurb: "The balanced default. Handles messy errors and unfamiliar setups without much hand-holding.",
    rate: { in: 3, out: 15 },
  },
  {
    id: "claude-opus-4-6",
    label: "Opus",
    blurb: "Strongest and priciest. Worth it only when a job has genuinely defeated the others.",
    rate: { in: 15, out: 75 },
  },
];

export const PRICING = Object.fromEntries(MODELS.map((m) => [m.id, m.rate]));

const FALLBACK_RATE = { in: 3, out: 15 };

export function relativeCost(modelId) {
  const rate = PRICING[modelId] || FALLBACK_RATE;
  return rate.in / FALLBACK_RATE.in;
}

export function estimateCost(usage, model) {
  if (!usage) return 0;
  const rate = PRICING[model] || FALLBACK_RATE;
  const m = 1e-6;
  return (
    (usage.input || 0) * rate.in * m +
    (usage.output || 0) * rate.out * m +
    (usage.cacheWrite || 0) * rate.in * 1.25 * m +
    (usage.cacheRead || 0) * rate.in * 0.1 * m
  );
}

export function fmtCost(dollars) {
  if (!dollars) return "$0.00";
  if (dollars < 0.01) return "<1¢";
  if (dollars < 1) return `${Math.round(dollars * 100)}¢`;
  return `$${dollars.toFixed(2)}`;
}

const EMPTY_USAGE = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, calls: 0 };

const AGENT_TOOLS = [
  {
    name: "set_plan",
    description:
      "Record the plan as an ordered checklist before doing anything else. Call this once at the start, after reading the goal. " +
      "Size the plan to the job: a step is one meaningful unit of work, usually one or two commands. 'Check the Python version' is ONE step, not three. " +
      "Most goals are 2 to 6 steps. Ten is a big job. If you are past fifteen you have almost certainly split things that belong together, or you are planning for situations that have not happened yet — plan only the path you actually expect to take, and revise later if reality differs. " +
      "Do not add steps for verification, for reporting back, or for deciding what to do next; those are part of the steps they belong to. " +
      "If the plan changes materially mid-run, call this again with the revised list.",
    input_schema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          items: { type: "string" },
          description: "The ordered steps, each a short imperative phrase.",
        },
      },
      required: ["steps"],
    },
  },
  {
    name: "step_done",
    description:
      "Mark a plan step finished so the user can see progress while they're away. Pass the zero-based index.",
    input_schema: {
      type: "object",
      properties: {
        index: { type: "number", description: "Zero-based index into the plan." },
        note: { type: "string", description: "One line on how it went." },
      },
      required: ["index"],
    },
  },
  {
    name: "run_command",
    description:
      "Run a shell command on the user's machine and get back stdout, stderr and the exit code. This is a real machine and these are real effects. " +
      "stdin is closed, so never run anything interactive — always pass the non-interactive flag (-y, --yes, --non-interactive, --quiet) rather than expecting to answer a prompt. " +
      "A command is killed when it goes SILENT, not when it runs long, so a multi-gigabyte download printing progress can run for an hour and is fine — you rarely need to touch the timeouts. " +
      "Long output is truncated in the middle; if you need a specific part, grep for it rather than printing whole files.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The exact command line to run." },
        cwd: { type: "string", description: "Absolute working directory. Omit for the home directory. Note that `cd` does not persist between calls — pass cwd instead." },
        quiet_secs: { type: "number", description: "Kill the command after this many seconds with NO output at all. Default 120, which suits almost everything. Raise it only for a command you expect to be genuinely silent for a long stretch — extracting a huge archive, or a database restore." },
        timeout_secs: { type: "number", description: "Absolute ceiling in seconds regardless of output. Default 3600. You rarely need to change this." },
        purpose: { type: "string", description: "One short line on why you are running this, shown in the run log." },
      },
      required: ["command"],
    },
  },
  {
    name: "ask_human",
    description:
      "Hand control back to the user for something you cannot do yourself, then continue once they confirm. The user has said they are nearby and willing to help. " +
      "Use this for: clicking through a GUI installer, approving a system permission dialog, signing in to something, choosing an option in an app window, or reading a value off a screen you have no way to query. " +
      "Do NOT use it to ask whether you should proceed, to pick between approaches, or because you are unsure — decide those yourself. It is for physical actions only, not for permission or advice. " +
      "Give exact instructions: what to click, where, and what they should see when it worked. Prefer a shell command over this tool whenever one exists.",
    input_schema: {
      type: "object",
      properties: {
        request: { type: "string", description: "Precisely what the user needs to do, in order. Name the window, the button, the menu item." },
        expect: { type: "string", description: "What they should see when it has worked, so they know when to continue." },
        need_reply: { type: "boolean", description: "True if you need them to type something back — a version number, a path, an error message they can see and you cannot. Default false." },
      },
      required: ["request"],
    },
  },
  {
    name: "write_file",
    description:
      "Write or append a file directly, without shell quoting. Use this for any config file, script, env file, or systemd unit — it is far more reliable than echo and heredocs, especially on Windows.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path. Parent directories are created." },
        contents: { type: "string", description: "The full file contents." },
        append: { type: "boolean", description: "Append instead of overwriting. Default false." },
      },
      required: ["path", "contents"],
    },
  },
  {
    name: "read_file",
    description: "Read a text file from disk. Use it to check a config you wrote, or to inspect a log after a failure.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Absolute path." } },
      required: ["path"],
    },
  },
  {
    name: "probe_env",
    description:
      "Report the OS, architecture, shell, home directory and which common tools (git, python, node, cargo, docker, winget, brew…) are already installed. Call this first when the goal involves installing anything — it stops you guessing at the platform.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "finish",
    description:
      "End the run. Call this when the goal is met, or when you are genuinely blocked and further attempts would be guessing. Be honest about which of the two it is.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Either 'done' or 'blocked'." },
        summary: { type: "string", description: "What you did, what state the machine is in now, and anything the user needs to do themselves." },
      },
      required: ["status", "summary"],
    },
  },
];

function systemPrompt(env) {
  return [
    "You are the autonomous execution agent inside NEXUS OS, a desktop command centre. The user has given you a goal and walked away. Nobody is watching. You will not get an answer if you ask a question, so do not ask one — decide, act, and record your reasoning in the run log instead.",

    env
      ? `The machine: ${env.os}/${env.arch}, shell ${env.shell}, home ${env.home}. Already installed: ${env.tools.length ? env.tools.join(", ") : "none of the common tools were found"}.`
      : "",

    "How to work:",
    "Start by calling set_plan. Match the plan to the actual size of the job — most goals are two to six steps, and some are one. If the user asks you to check a version and update it, that is a two step plan, not a project. Do not pad the plan with steps for verifying, reporting, or working out what to do next: those happen inside the steps they belong to. Do not plan for branches that have not happened — plan the path you expect, and call set_plan again if reality turns out differently. A short plan you actually follow beats a thorough one you abandon at step three.",

    "If the goal came from a video transcript or a written walkthrough, read the whole thing first and convert it into commands for THIS machine — transcripts are usually recorded on a different OS, name paths that do not exist here, and skip steps the presenter had already done. Translate rather than transcribe. Never paste a command you do not understand.",

    "Verify as you go, but keep it proportionate. After an install, run the thing's --version. After writing a config, read it back. A step is not done because the command exited zero; it is done because you checked the result. That check is part of the step, not a step of its own.",

    "When something fails, read the actual error before reacting. Fix the cause you can see. If the same approach fails twice, change approach rather than retrying it a third time — a different package manager, a different install method, building from source. If you have tried three genuinely different approaches and all failed, call finish with status 'blocked' and explain precisely what stopped you and what you would try next. A clear blocked report is a good outcome; flailing is not.",

    "Never run anything interactive — stdin is closed and the process will be killed once it goes quiet. Always pass the non-interactive flag.",

    "You have a shell and the filesystem. You have no mouse, no screen, and no way to click. When a step genuinely requires a graphical action — a GUI installer, a permission dialog, a sign-in, a value only visible in an app window — call ask_human and the user will do it for you; they have said they are nearby. Reach for the command line first, though: on Windows a great many things that a walkthrough does by clicking can be done with winget, msiexec /quiet, or a direct download plus a silent-install flag. ask_human is for what is truly impossible headlessly, not for what is merely easier by hand, and never for asking permission or advice.",

    "`cd` does not carry between run_command calls. Each call starts fresh. Pass cwd.",

    "Prefer write_file over shell redirection for anything with quotes, newlines or special characters.",

    "Do not touch anything outside the scope of the goal. Do not disable security software, modify boot configuration, delete user data, or 'clean up' files you did not create. If a walkthrough tells you to, skip that step and note it in the summary.",

    "Some commands are blocked by a destructive-command guard. If you hit it, do not try to work around it — that block is the correct outcome. Note it and continue with the rest of the plan.",

    "Call step_done as you complete plan items so the user sees progress when they come back. Call finish when you are done. Keep any text you write short — the run log is the record, not prose.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const listeners = new Set();

let state = {
  status: "idle",   // idle | planning | running | waiting | done | blocked | error | stopped
  runId: null,
  goal: "",
  plan: [],         // [{ text, done, note }]
  log: [],          // [{ id, kind, ... }]
  stream: [],       // live output lines from the command in flight
  step: 0,
  maxSteps: DEFAULTS.maxSteps,
  startedAt: null,
  finishedAt: null,
  pending: null,    // the handoff the run is currently blocked on, if any
  pausedMs: 0,      // time spent waiting on the user, excluded from the budget
  summary: "",
  error: null,
  usage: { ...EMPTY_USAGE },  // tokens across every model call in this run
  model: DEFAULTS.model,      // kept so cost can be priced after the run ends
};

let pendingResolve = null;

function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => {
    try { fn(state); } catch { /* a broken subscriber must not stop the run */ }
  });
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

let logSeq = 0;
function push(entry) {
  const row = { id: ++logSeq, at: Date.now(), ...entry };
  set({ log: [...state.log, row] });
  if (state.runId) {
    invoke("agent_journal_append", { runId: state.runId, entry: JSON.stringify(row) }).catch(() => {});
  }
  return row;
}

let unlistenOutput = null;

async function attachStream() {
  if (unlistenOutput || !inTauri || !window.__TAURI__?.event) return;
  unlistenOutput = await window.__TAURI__.event.listen("agent:output", (evt) => {
    const p = evt.payload;
    if (!p || p.run_id !== state.runId) return;
    const next = [...state.stream, { stream: p.stream, line: p.line }];
    set({ stream: next.length > 400 ? next.slice(-400) : next });
  });
}

async function callModel(body, signal) {
  if (inTauri) {
    const text = await invoke("call_model", { payload: { body: JSON.stringify(body) } });
    return JSON.parse(text);
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`model returned ${res.status}`);
  return res.json();
}

function middleTruncate(text, keep = 6000) {
  const s = String(text);
  if (s.length <= keep) return s;
  const head = Math.floor(keep * 0.4);
  const tail = keep - head;
  const dropped = s.length - keep;
  return `${s.slice(0, head)}\n\n…[${dropped.toLocaleString()} characters of output omitted]…\n\n${s.slice(-tail)}`;
}

function markConversationCache(convo) {
  if (!convo.length) return convo;

  const out = convo.slice();
  const lastIdx = out.length - 1;
  const last = out[lastIdx];

  const blocks = Array.isArray(last.content)
    ? last.content.slice()
    : [{ type: "text", text: String(last.content) }];

  if (!blocks.length) return convo;

  blocks[blocks.length - 1] = {
    ...blocks[blocks.length - 1],
    cache_control: { type: "ephemeral" },
  };

  out[lastIdx] = { ...last, content: blocks };
  return out;
}

function weigh(convo) {
  let n = 0;
  for (const m of convo) n += JSON.stringify(m.content).length;
  return n;
}

function compact(convo, budget) {
  if (weigh(convo) < budget) return convo;

  const KEEP_RECENT = 8; // turns left untouched at the tail
  const cutoff = Math.max(0, convo.length - KEEP_RECENT);

  const out = convo.map((msg, i) => {
    if (i >= cutoff) return msg;
    if (!Array.isArray(msg.content)) return msg;

    const content = msg.content.map((block) => {
      if (block.type !== "tool_result") return block;
      const body = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
      if (body.length < 400) return block;
      const firstLine = body.split("\n").find((l) => l.trim()) || "";
      return {
        ...block,
        content: `[earlier step, output compacted — ${body.length} chars] ${firstLine.slice(0, 160)}`,
      };
    });
    return { ...msg, content };
  });

  return out;
}

async function execTool(name, input) {
  if (name === "set_plan") {
    const raw = input.steps || [];

    if (raw.length > 15 && !state.log.some((r) => r.kind === "replan")) {
      push({ kind: "replan", count: raw.length });
      return (
        `That plan has ${raw.length} steps, which is far more than this kind of goal usually needs. ` +
        `You have almost certainly split single units of work apart, or planned for branches that have not happened. ` +
        `Call set_plan again with the work grouped into meaningful steps — one step per meaningful action, verification folded into the step it belongs to, no steps for branches you have not reached. ` +
        `If after regrouping it genuinely is still this large, submit it again and it will be accepted.`
      );
    }

    const steps = raw.map((text) => ({ text, done: false, note: "" }));
    set({ plan: steps });
    push({ kind: "plan", steps: steps.map((s) => s.text) });
    return `Plan recorded, ${steps.length} steps.`;
  }

  if (name === "step_done") {
    const i = Number(input.index);
    const plan = state.plan.map((s, idx) => (idx === i ? { ...s, done: true, note: input.note || "" } : s));
    set({ plan });
    push({ kind: "step", index: i, text: plan[i]?.text || `step ${i}`, note: input.note || "" });
    return "Noted.";
  }

  if (name === "probe_env") {
    const env = await invoke("agent_probe_env");
    push({ kind: "probe", env });
    return JSON.stringify(env);
  }

  if (name === "run_command") {
    const cmd = String(input.command || "").trim();
    const entry = push({
      kind: "command",
      command: cmd,
      cwd: input.cwd || "",
      purpose: input.purpose || "",
      status: "running",
    });
    set({ stream: [] });

    let res;
    try {
      res = await invoke("agent_exec", {
        runId: state.runId,
        cmd,
        cwd: input.cwd || "",
        timeoutSecs: Math.round(input.timeout_secs || DEFAULTS.commandTimeout),
        quietSecs: Math.round(input.quiet_secs || DEFAULTS.commandQuiet),
      });
    } catch (e) {
      const msg = String(e?.message || e);
      updateLog(entry.id, { status: "error", result: msg });
      return `Command failed to run: ${msg}`;
    }

    const ok = res.code === 0 && res.end_reason === "exited";
    updateLog(entry.id, {
      status: { stalled: "stalled", over_time: "timeout", stopped: "stopped" }[res.end_reason] || (ok ? "ok" : "failed"),
      code: res.code,
      ms: res.duration_ms,
      result: (res.stdout || res.stderr || "").slice(0, 4000),
    });

    const headline = {
      exited: `exit code ${res.code}`,
      stalled: `KILLED — produced no output for ${Math.round(res.silent_ms / 1000)}s`,
      over_time: `KILLED — hit the absolute time ceiling after ${Math.round(res.duration_ms / 1000)}s`,
      stopped: "KILLED — the user stopped the run",
    }[res.end_reason] || `exit code ${res.code}`;

    const parts = [headline];
    if (res.stdout.trim()) parts.push(`stdout:\n${middleTruncate(res.stdout.trim())}`);
    if (res.stderr.trim()) parts.push(`stderr:\n${middleTruncate(res.stderr.trim())}`);
    if (!res.stdout.trim() && !res.stderr.trim()) parts.push("(no output)");

    if (res.end_reason === "stalled") {
      parts.push(
        "Going silent almost always means it was waiting for input that will never come, since stdin is closed. " +
        "Do NOT simply retry it — find the non-interactive flag, or use a different tool that doesn't prompt. " +
        "Only raise quiet_secs if you are confident this particular command is legitimately silent for long stretches."
      );
    }
    if (res.end_reason === "over_time") {
      parts.push("It was producing output the whole time, so it was working — just very slow. Retrying with a larger timeout_secs is reasonable here.");
    }
    return parts.join("\n\n");
  }

  if (name === "ask_human") {
    const req = {
      request: String(input.request || "").trim(),
      expect: String(input.expect || "").trim(),
      needReply: !!input.need_reply,
    };
    const entry = push({ kind: "handoff", ...req, status: "waiting" });

    const pausedFrom = Date.now();
    set({ status: "waiting", pending: req, stream: [] });

    const reply = await new Promise((resolve) => { pendingResolve = resolve; });
    pendingResolve = null;

    set({
      status: "running",
      pending: null,
      pausedMs: state.pausedMs + (Date.now() - pausedFrom),
    });

    if (reply === null) {
      updateLog(entry.id, { status: "cancelled" });
      return "The user stopped the run rather than doing this.";
    }

    updateLog(entry.id, { status: "done", reply: reply || "" });
    return reply
      ? `The user has done it. They report: ${reply}`
      : "The user confirms they have done it. Carry on from here — verify the result yourself before assuming it worked.";
  }

  if (name === "write_file") {
    const entry = push({ kind: "file", action: input.append ? "append" : "write", path: input.path, bytes: (input.contents || "").length });
    try {
      const msg = await invoke("agent_write_file", {
        path: input.path,
        contents: input.contents ?? "",
        append: !!input.append,
      });
      updateLog(entry.id, { status: "ok" });
      return msg;
    } catch (e) {
      updateLog(entry.id, { status: "failed", result: String(e?.message || e) });
      return `Write failed: ${e?.message || e}`;
    }
  }

  if (name === "read_file") {
    push({ kind: "file", action: "read", path: input.path, status: "ok" });
    try {
      return await invoke("agent_read_file", { path: input.path });
    } catch (e) {
      return `Read failed: ${e?.message || e}`;
    }
  }

  return `Unknown tool: ${name}`;
}

function updateLog(id, patch) {
  set({ log: state.log.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
}

let abort = null;

export async function start(goal, opts = {}) {
  if (state.status === "running" || state.status === "planning" || state.status === "waiting") {
    throw new Error("A run is already in progress. Stop it first.");
  }
  if (!goal.trim()) throw new Error("Give the agent something to do.");

  const runId = `run-${Date.now()}`;
  const cfg = { ...DEFAULTS, ...opts };

  abort = new AbortController();
  logSeq = 0;

  set({
    status: "planning",
    runId,
    goal: goal.trim(),
    plan: [],
    log: [],
    stream: [],
    step: 0,
    maxSteps: cfg.maxSteps,
    startedAt: Date.now(),
    finishedAt: null,
    pending: null,
    pausedMs: 0,
    summary: "",
    error: null,
    usage: { ...EMPTY_USAGE },
    model: cfg.model,
  });

  await invoke("agent_reset", { runId }).catch(() => {});
  await attachStream();

  push({ kind: "goal", text: goal.trim() });

  let env = null;
  try {
    env = await invoke("agent_probe_env");
    push({ kind: "probe", env });
  } catch { /* not fatal — the model can call probe_env itself */ }

  const convo = [
    {
      role: "user",
      content:
        `Goal:\n\n${goal.trim()}\n\n` +
        `Work through this to completion on this machine. Plan first, then execute, verifying each step. ` +
        `Nobody is watching, so do not ask questions — decide and act. Call finish when you are done or genuinely blocked.`,
    },
  ];

  set({ status: "running" });

  const deadline = Date.now() + cfg.maxMinutes * 60_000;

  try {
    for (let step = 0; step < cfg.maxSteps; step++) {
      if (abort.signal.aborted) return endRun("stopped", "Stopped by the user.");

      if (Date.now() - state.pausedMs > deadline) {
        return endRun("blocked", `Hit the ${cfg.maxMinutes} minute working budget for this run, not counting time spent waiting on you. Whatever finished before this point is still done — check the log.`);
      }

      set({ step: step + 1 });

      const trimmed = compact(convo, cfg.contextBudget);

      const cachedTools = AGENT_TOOLS.map((t, i) =>
        i === AGENT_TOOLS.length - 1
          ? { ...t, cache_control: { type: "ephemeral" } }
          : t
      );

      const messages = markConversationCache(trimmed);

      const data = await callModel(
        {
          model: cfg.model,
          max_tokens: 4000,
          system: [{ type: "text", text: systemPrompt(env) }],
          messages,
          tools: cachedTools,
        },
        abort.signal
      );

      if (abort.signal.aborted) return endRun("stopped", "Stopped by the user.");

      const u = data.usage || {};
      set({
        usage: {
          input:      state.usage.input      + (u.input_tokens || 0),
          output:     state.usage.output     + (u.output_tokens || 0),
          cacheWrite: state.usage.cacheWrite + (u.cache_creation_input_tokens || 0),
          cacheRead:  state.usage.cacheRead  + (u.cache_read_input_tokens || 0),
          calls:      state.usage.calls + 1,
        },
      });

      const blocks = data.content || [];
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      const calls = blocks.filter((b) => b.type === "tool_use");

      if (text) push({ kind: "thought", text });

      if (data.stop_reason !== "tool_use" || calls.length === 0) {
        if (state.log.some((r) => r.kind === "nudge")) {
          return endRun("done", text || "The agent stopped without a closing summary.");
        }
        push({ kind: "nudge" });
        convo.push({ role: "assistant", content: blocks.length ? blocks : [{ type: "text", text: text || "..." }] });
        convo.push({
          role: "user",
          content: "You stopped without calling a tool. If the goal is met, call finish with status 'done'. If you are blocked, call finish with status 'blocked'. Otherwise continue working.",
        });
        continue;
      }

      convo.push({ role: "assistant", content: blocks });

      const results = [];
      let finished = null;

      for (const call of calls) {
        if (abort.signal.aborted) return endRun("stopped", "Stopped by the user.");

        if (call.name === "finish") {
          finished = call.input || {};
          results.push({ type: "tool_result", tool_use_id: call.id, content: "Run closed." });
          continue;
        }

        const out = await execTool(call.name, call.input || {});
        results.push({ type: "tool_result", tool_use_id: call.id, content: String(out) });
      }

      convo.push({ role: "user", content: results });

      if (finished) {
        const status = finished.status === "blocked" ? "blocked" : "done";
        return endRun(status, finished.summary || "Run complete.");
      }
    }

    return endRun("blocked", `Reached the ${cfg.maxSteps} step ceiling without finishing. The log shows how far it got — you can start a new run picking up from there.`);
  } catch (e) {
    if (e?.name === "AbortError") return endRun("stopped", "Stopped by the user.");
    const msg = e?.message || String(e);
    push({ kind: "error", text: msg });
    set({ status: "error", error: msg, finishedAt: Date.now() });
    return state;
  }
}

function endRun(status, summary) {
  const finishedAt = Date.now();
  push({ kind: "finish", status, summary });
  push({
    kind: "stats",
    ms: finishedAt - (state.startedAt || finishedAt),
    pausedMs: state.pausedMs,
    usage: state.usage,
    model: state.model,
    commands: state.log.filter((r) => r.kind === "command").length,
  });
  set({ status, summary, finishedAt, stream: [] });
  return state;
}

export async function stop() {
  abort?.abort();

  if (pendingResolve) {
    const r = pendingResolve;
    pendingResolve = null;
    r(null);
  }

  if (state.runId) await invoke("agent_stop", { runId: state.runId }).catch(() => {});
  if (state.status === "running" || state.status === "planning" || state.status === "waiting") {
    endRun("stopped", "Stopped by the user. Anything already run has already happened — check the log for where it got to.");
  }
}

export function respond(text) {
  if (!pendingResolve) return;
  const r = pendingResolve;
  pendingResolve = null;
  r(typeof text === "string" ? text.trim() : "");
}

export function reset() {
  if (state.status === "running" || state.status === "planning" || state.status === "waiting") return;
  set({
    status: "idle", runId: null, goal: "", plan: [], log: [], stream: [], step: 0,
    summary: "", error: null, startedAt: null, finishedAt: null, pending: null, pausedMs: 0,
    usage: { ...EMPTY_USAGE },
  });
}

export async function guardEnabled() {
  try { return await invoke("agent_guard_enabled"); } catch { return true; }
}

export async function setGuard(on) {
  return invoke("agent_set_guard", { enabled: !!on });
}

export async function pastRuns() {
  try { return await invoke("agent_journal_list"); } catch { return []; }
}

export async function pastRunSummaries(limit = 40) {
  const ids = await pastRuns();
  const out = [];

  for (const id of ids.slice(0, limit)) {
    const rows = await loadRun(id);
    if (!rows.length) continue;

    const goal = rows.find((r) => r.kind === "goal")?.text || "(no goal recorded)";
    const finish = rows.find((r) => r.kind === "finish");
    const stats = rows.find((r) => r.kind === "stats");
    const plan = rows.filter((r) => r.kind === "plan").pop();
    const steps = rows.filter((r) => r.kind === "step").length;

    out.push({
      id,
      goal,
      at: Number(id.replace(/^run-/, "")) || rows[0]?.at || 0,
      status: finish?.status || "stopped",
      summary: finish?.summary || "",
      ms: stats?.ms || 0,
      usage: stats?.usage || null,
      model: stats?.model || DEFAULTS.model,
      commands: stats?.commands ?? rows.filter((r) => r.kind === "command").length,
      steps,
      planned: plan?.steps?.length || 0,
    });
  }

  return out;
}

export async function deleteRun(runId) {
  try { await invoke("agent_journal_clear", { runId }); } catch { /* already gone */ }
}

export async function loadRun(runId) {
  try {
    const lines = await invoke("agent_journal_read", { runId });
    return lines.map((l) => { try { return JSON.parse(l.replace(/\\n/g, "\n")); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}

export const IS_DESKTOP = inTauri;
