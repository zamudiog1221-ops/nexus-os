// NEXUS OS  -  Agent Mode
// The surface for the engine in agentEngine.js. Two states, really: a box you
// paste a goal into, and a live record of what the agent is doing to your
// machine. The record matters more than the box  -  the whole premise is that
// you are not here while it works, so when you come back the log has to answer
// "what did it do" without you having to reconstruct it.
//
// This component owns no run state. It subscribes to the engine singleton, so
// leaving Agent Mode and coming back mid-run shows the run still going.

import React, { useState, useEffect, useRef } from "react";
import {
  Play, Square, Loader2, CheckCircle2, AlertTriangle, Terminal,
  FileText, Search, Flag, ShieldCheck, ShieldOff, Trash2, ChevronDown, Hand,
  Circle, Wrench, Clock, ArrowLeft, Gauge,
} from "lucide-react";
import * as engine from "./agentEngine.js";
// The same renderer the assistant uses, so the agent's prose comes out with
// real headings, bold and tables instead of raw ** and | characters.
import { MsgText } from "./NexusCore.jsx";

// plain language
// Simple view exists because the feed below is a developer's view of a run:
// commands, exit codes, turn counts. Someone who just wants the job done needs
// one sentence about what is happening now and a checklist showing how far in
// it is. Nothing here changes what the agent does  -  only what gets shown.

const FRIENDLY_STATUS = {
  planning: "Working out what to do",
  running:  "Working on it",
  waiting:  "Waiting for you",
  done:     "All done",
  blocked:  "Couldn't finish",
  stopped:  "Stopped",
  error:    "Something went wrong",
};

/// One sentence describing what the agent is doing at this instant, taken from
/// the most recent log entry that represents actual work. The model writes a
/// `purpose` line for each command precisely so there is something human to
/// show here; the fallbacks cover the case where it didn't.
function plainNow(run) {
  if (run.status === "planning") return "Reading the goal and working out the steps";
  if (run.status === "waiting")  return "Waiting for you to do something on your screen";

  for (let i = run.log.length - 1; i >= 0; i--) {
    const r = run.log[i];
    if (r.kind === "command") {
      if (r.purpose) return r.purpose;
      return r.status === "running" ? "Running a command on your computer" : "Finished a command";
    }
    if (r.kind === "file") {
      const verb = { write: "Saving", append: "Adding to", read: "Reading" }[r.action] || "Working on";
      return `${verb} a file`;
    }
    if (r.kind === "probe") return "Checking what's already installed on your computer";
  }
  return "Getting started";
}

/// The step the agent is on: first unfinished item, or null when all are done.
function currentStep(plan) {
  const i = plan.findIndex((s) => !s.done);
  return i === -1 ? null : i;
}

const PRESETS = [
  {
    label: "Install from a transcript",
    hint: "Paste the whole thing — it'll translate it for this machine",
    seed: "Here is the transcript of a video walkthrough. Follow it on this machine, translating anything platform-specific:\n\n",
  },
  {
    label: "Set up a dev environment",
    hint: "Toolchain, dependencies, verify it runs",
    seed: "Set up a working development environment for ",
  },
  {
    label: "Diagnose something",
    hint: "Investigate, then report — no changes",
    seed: "Investigate and report on the following, but do not change anything on the machine:\n\n",
  },
];

export default function AgentMode() {
  const [run, setRun] = useState(engine.getState());
  const [goal, setGoal] = useState("");
  const [guard, setGuard] = useState(true);
  const [showOpts, setShowOpts] = useState(false);
  const [opts, setOpts] = useState({
    maxSteps: 80, maxMinutes: 45, commandTimeout: 600,
    model: engine.DEFAULTS.model,
  });
  const [err, setErr] = useState(null);
  // Simple by default: the person who most needs this screen is the one least
  // likely to go looking for a setting to make it readable.
  const [details, setDetails] = useState(false);
  // A past run being read back from its journal, or null for the normal view.
  const [viewing, setViewing] = useState(null);
  const feedRef = useRef(null);

  useEffect(() => engine.subscribe(setRun), []);
  useEffect(() => { engine.guardEnabled().then(setGuard); }, []);

  // Follow the feed unless the user has scrolled up to read something.
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [run.log, run.stream]);

  const live = run.status === "running" || run.status === "planning";
  const waiting = run.status === "waiting";

  const go = async () => {
    setErr(null);
    try {
      await engine.start(goal, opts);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  };

  const toggleGuard = async () => {
    const next = !guard;
    setGuard(next);
    await engine.setGuard(next).catch(() => {});
  };

  if (!engine.IS_DESKTOP) {
    return (
      <div className="nx-agent nx-agent-gate">
        <AlertTriangle size={22} />
        <h3>Agent Mode needs the desktop app</h3>
        <p>It runs real commands on this machine, which the browser build has no way to do. Launch NexusOS with <code>npm run tauri dev</code>.</p>
      </div>
    );
  }

  return (
    <div className="nx-agent">
      <div className="nx-agent-head">
        <div className="nx-agent-title">
          <h2>Agent Mode</h2>
          <p>Tell it what you want done and walk away. It works out the steps, does them on your computer, checks its own work, and asks you only when something needs a human — clicking through an installer, or approving a permission box.</p>
        </div>
        <button
          className={`nx-agent-guard ${guard ? "on" : "off"}`}
          onClick={toggleGuard}
          disabled={live}
          title={guard
            ? "Commands that could wipe a disk, delete everything, or shut down the machine are blocked. Click to allow them."
            : "Nothing is blocked — the agent can run anything, including commands that destroy data. Click to turn protection back on."}
        >
          {guard ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
          {guard ? "Protection on" : "Protection off"}
        </button>
      </div>

      {viewing && <PastRun summary={viewing} onBack={() => setViewing(null)} />}

      {!viewing && <StatusBar run={run} onStop={engine.stop} onReset={engine.reset} />}

      {!viewing && run.status === "idle" && (
        <div className="nx-agent-setup">
          <div className="nx-agent-presets">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => setGoal(p.seed)}>
                <span>{p.label}</span>
                <small>{p.hint}</small>
              </button>
            ))}
          </div>

          <textarea
            className="nx-agent-goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={"What should it do?\n\nPaste a full video transcript, a README, a list of steps, or just describe the outcome you want. It works out the commands itself."}
            spellCheck={false}
          />

          <ModelPicker value={opts.model} onChange={(model) => setOpts({ ...opts, model })} />

          <div className="nx-agent-controls">
            <button className="nx-agent-opts" onClick={() => setShowOpts((v) => !v)}>
              <ChevronDown size={12} className={showOpts ? "open" : ""} /> When to give up
            </button>
            <span className="nx-agent-budget">
              Stops after {opts.maxMinutes} minutes of work
            </span>
            <button className="nx-agent-run" onClick={go} disabled={!goal.trim()}>
              <Play size={13} /> Start
            </button>
          </div>

          {showOpts && (
            <div className="nx-agent-optbox">
              <Num label="Most things it can try" hint="It gives up after this many attempts, so it can't loop forever." value={opts.maxSteps} min={5} max={200}
                   onChange={(v) => setOpts({ ...opts, maxSteps: v })} />
              <Num label="Longest it can work (minutes)" hint="Time you spend helping doesn't count." value={opts.maxMinutes} min={1} max={240}
                   onChange={(v) => setOpts({ ...opts, maxMinutes: v })} />
              <Num label="Longest one command can take (seconds)" hint="Raise it if you expect a long download or install." value={opts.commandTimeout} min={10} max={3600}
                   onChange={(v) => setOpts({ ...opts, commandTimeout: v })} />
            </div>
          )}

          {err && <div className="nx-agent-err"><AlertTriangle size={13} /> {err}</div>}

          <p className="nx-agent-warn">
            This makes real changes to your computer, and it won't ask first. Only paste instructions from
            a source you trust — whatever you give it, it will try to do.
          </p>

          <History onOpen={setViewing} />
        </div>
      )}

      {!viewing && run.status !== "idle" && (
        <>
          <button
            className={`nx-agent-viewtog ${details ? "on" : ""}`}
            onClick={() => setDetails((v) => !v)}
            title={details
              ? "Back to the plain summary"
              : "Show every command, its output and exit code"}
          >
            <Wrench size={12} />
            {details ? "Hide technical details" : "Show technical details"}
          </button>

          {details ? (
            <div className="nx-agent-body">
              {run.plan.length > 0 && <Plan plan={run.plan} />}

              <div className="nx-agent-feed" ref={feedRef}>
                {run.log.map((row) => <LogRow key={row.id} row={row} />)}

                {waiting && run.pending && <Handoff req={run.pending} onDone={engine.respond} />}

                {live && run.stream.length > 0 && (
                  <div className="nx-agent-stream">
                    {run.stream.slice(-14).map((l, i) => (
                      <div key={i} className={l.stream === "err" ? "err" : ""}>{l.line}</div>
                    ))}
                  </div>
                )}

                {live && (
                  <div className="nx-agent-thinking">
                    <Loader2 size={12} className="nx-spin" /> Working
                    {run.step > run.maxSteps * 0.6 && ` — turn ${run.step}, ceiling is ${run.maxSteps}`}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <SimpleView run={run} live={live} waiting={waiting} onRespond={engine.respond} />
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- model picker */
// Which brain runs the job. Sits on the start screen rather than buried in
// settings because it is the single biggest lever on what a run costs, and the
// right answer genuinely changes job to job.

function ModelPicker({ value, onChange }) {
  const chosen = engine.MODELS.find((m) => m.id === value) || engine.MODELS[1];

  return (
    <div className="nx-agent-models">
      <div className="nx-agent-modelrow">
        {engine.MODELS.map((m) => {
          const rel = engine.relativeCost(m.id);
          return (
            <button
              key={m.id}
              className={`nx-agent-model ${m.id === value ? "on" : ""}`}
              onClick={() => onChange(m.id)}
            >
              <span>{m.label}</span>
              <small>
                {rel < 1 ? `~${Math.round(1 / rel)}× cheaper` : rel > 1 ? `~${Math.round(rel)}× dearer` : "baseline"}
              </small>
            </button>
          );
        })}
      </div>
      <p className="nx-agent-modelnote">{chosen.blurb}</p>
    </div>
  );
}

/* --------------------------------------------------------------- history */
// Every run has been journalled to disk since Agent Mode was built; until now
// nothing read them back. A run you left alone for an hour is exactly the run
// you want to reread later, so this lists them and reopens any one in full.

function History({ onOpen }) {
  const [runs, setRuns] = useState(null); // null = still loading
  const [open, setOpen] = useState(false);

  const load = () => engine.pastRunSummaries().then(setRuns).catch(() => setRuns([]));
  useEffect(() => { load(); }, []);

  const remove = async (e, id) => {
    e.stopPropagation();
    await engine.deleteRun(id);
    setRuns((p) => (p || []).filter((r) => r.id !== id));
  };

  if (!runs || runs.length === 0) return null;

  const shown = open ? runs : runs.slice(0, 4);

  return (
    <div className="nx-agent-history">
      <h4>
        <Clock size={12} /> Earlier runs
        <em>{runs.length}</em>
      </h4>

      <div className="nx-agent-runs">
        {shown.map((r) => (
          <button key={r.id} className="nx-agent-runrow" onClick={() => onOpen(r)}>
            <span className={`nx-agent-rundot ${r.status}`} />
            <span className="nx-agent-runwhat">{firstLine(r.goal)}</span>
            <span className="nx-agent-runmeta">
              {when(r.at)}
              {r.ms ? ` · ${fmtMs(r.ms)}` : ""}
              {r.usage ? ` · ${engine.fmtCost(engine.estimateCost(r.usage, r.model))}` : ""}
            </span>
            <span className="nx-agent-rundel" onClick={(e) => remove(e, r.id)} title="Delete this record">
              <Trash2 size={12} />
            </span>
          </button>
        ))}
      </div>

      {runs.length > 4 && (
        <button className="nx-agent-runmore" onClick={() => setOpen((v) => !v)}>
          {open ? "Show fewer" : `Show all ${runs.length}`}
        </button>
      )}
    </div>
  );
}

/// A past run reopened from its journal. Read-only, and deliberately the
/// technical feed  -  if you are digging up an old run you want the detail.
function PastRun({ summary, onBack }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    engine.loadRun(summary.id).then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [summary.id]);

  return (
    <div className="nx-agent-past">
      <div className="nx-agent-pasthead">
        <button className="nx-agent-back" onClick={onBack}>
          <ArrowLeft size={13} /> Back
        </button>
        <div>
          <strong>{firstLine(summary.goal)}</strong>
          <small>
            {when(summary.at)} · {summary.status === "done" ? "finished" : summary.status}
            {summary.ms ? ` · ${fmtMs(summary.ms)}` : ""}
          </small>
        </div>
      </div>

      <div className="nx-agent-feed">
        {rows === null
          ? <div className="nx-agent-thinking"><Loader2 size={12} className="nx-spin" /> Reading the record…</div>
          : rows.length === 0
            ? <p className="nx-agent-simple-empty">This run's record is empty or was deleted.</p>
            : rows.map((row, i) => <LogRow key={row.id ?? i} row={row} />)}
      </div>
    </div>
  );
}

function firstLine(text) {
  const line = String(text || "").split("\n").find((l) => l.trim()) || "Untitled run";
  return line.length > 96 ? `${line.slice(0, 96)}…` : line;
}

/// Relative for anything recent, absolute once it stops being "the other day".
function when(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ----------------------------------------------------------- simple view */
// What someone sees who does not want to read a terminal: one line for what is
// happening now, a checklist for how far along it is, and  -  when it matters  - 
// the handoff card, which is the only thing on this screen they must act on.

function SimpleView({ run, live, waiting, onRespond }) {
  const cur = currentStep(run.plan);
  const finished = run.status === "done";
  const stopped = run.status === "blocked" || run.status === "stopped" || run.status === "error";

  return (
    <div className="nx-agent-simple">
      {waiting && run.pending && (
        <Handoff req={run.pending} onDone={onRespond} />
      )}

      {live && (
        <div className="nx-agent-now">
          <Loader2 size={16} className="nx-spin" />
          <div>
            <strong>{plainNow(run)}</strong>
            {run.plan.length > 0 && cur !== null && (
              <small>Step {cur + 1} of {run.plan.length}</small>
            )}
          </div>
        </div>
      )}

      {finished && (
        <div className="nx-agent-now ok">
          <CheckCircle2 size={16} />
          <div>
            <strong>Finished</strong>
            <small>Everything on the list is done.</small>
          </div>
        </div>
      )}

      {stopped && (
        <div className="nx-agent-now warn">
          <AlertTriangle size={16} />
          <div>
            <strong>
              {run.status === "stopped" ? "You stopped it" : "It couldn't finish"}
            </strong>
            <small>
              {run.status === "stopped"
                ? "Anything it already did has still happened."
                : "What it managed to do is listed below."}
            </small>
          </div>
        </div>
      )}

      {run.plan.length > 0 && (
        <ol className="nx-agent-checklist">
          {run.plan.map((s, i) => (
            <li
              key={i}
              className={s.done ? "done" : i === cur && live ? "current" : "todo"}
            >
              <span className="nx-agent-checkmark">
                {s.done
                  ? <CheckCircle2 size={15} />
                  : i === cur && live
                    ? <Loader2 size={15} className="nx-spin" />
                    : <Circle size={15} />}
              </span>
              <div>
                {s.text}
                {s.note && <small>{s.note}</small>}
              </div>
            </li>
          ))}
        </ol>
      )}

      {run.plan.length === 0 && !waiting && (
        <p className="nx-agent-simple-empty">
          Reading what you asked for and working out the steps…
        </p>
      )}

      {!live && run.summary && (
        <div className="nx-agent-simple-summary">
          <h4>What happened</h4>
          <div className="nx-agent-prose"><MsgText text={run.summary} /></div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- handoff */
// The run is parked in an unresolved promise while this is on screen. It stays
// parked as long as it needs to  -  the budget clock is paused  -  so there is no
// hurry and no penalty for wandering off mid-install.

function Handoff({ req, onDone }) {
  const [reply, setReply] = useState("");
  const ref = useRef(null);

  useEffect(() => { setTimeout(() => ref.current?.focus(), 60); }, []);

  const submit = () => onDone(reply);

  return (
    <div className="nx-agent-handoff">
      <div className="nx-agent-handoff-head">
        <Hand size={14} />
        <strong>Your turn — it needs a hand</strong>
        <span>it's paused and will wait as long as you need</span>
      </div>

      <p className="nx-agent-handoff-req">{req.request}</p>
      {req.expect && <p className="nx-agent-handoff-expect">You'll know it worked when: {req.expect}</p>}

      {req.needReply && (
        <textarea
          ref={ref}
          className="nx-agent-handoff-input"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder="Type what it asked for…"
          spellCheck={false}
        />
      )}

      <div className="nx-agent-handoff-foot">
        <button className="nx-agent-handoff-go" onClick={submit} disabled={req.needReply && !reply.trim()}>
          <CheckCircle2 size={13} /> Done — carry on
        </button>
        {!req.needReply && (
          <input
            className="nx-agent-handoff-note"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Anything it should know? (optional)"
          />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- status */

function StatusBar({ run, onStop, onReset }) {
  const [now, setNow] = useState(Date.now());
  const live = run.status === "running" || run.status === "planning" || run.status === "waiting";

  useEffect(() => {
    if (!live) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [live]);

  if (run.status === "idle") return null;

  const elapsed = Math.round(((run.finishedAt || now) - (run.startedAt || now)) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = String(elapsed % 60).padStart(2, "0");

  const cls = {
    planning: "live", running: "live", waiting: "hold",
    done: "ok", blocked: "warn", stopped: "warn", error: "bad",
  }[run.status] || "";

  const doneCount = run.plan.filter((s) => s.done).length;

  return (
    <div className={`nx-agent-status ${cls}`}>
      <span className="nx-agent-dot" />
      <strong>{FRIENDLY_STATUS[run.status] || run.status}</strong>
      <span className="nx-agent-meta">
        {mins}:{secs}
        {run.plan.length > 0 && ` · ${doneCount} of ${run.plan.length} steps done`}
        {run.usage?.calls > 0 && ` · ${engine.fmtCost(engine.estimateCost(run.usage, run.model))}`}
      </span>

      {live ? (
        <button className="nx-agent-stop" onClick={onStop}>
          <Square size={11} fill="currentColor" /> Stop
        </button>
      ) : (
        <button className="nx-agent-stop ghost" onClick={onReset}>
          <Trash2 size={11} /> Start something new
        </button>
      )}

      {/* The summary is rendered properly below — as "What happened" in the
          simple view, and as the closing row of the feed in the technical one.
          Repeating it here dumped raw markdown into a one-line strip. */}
    </div>
  );
}

/* ------------------------------------------------------------------ plan */

function Plan({ plan }) {
  return (
    <div className="nx-agent-plan">
      <h4>Plan</h4>
      <ol>
        {plan.map((s, i) => (
          <li key={i} className={s.done ? "done" : ""}>
            <span className="nx-agent-tick">{s.done ? <CheckCircle2 size={12} /> : <em>{i + 1}</em>}</span>
            <div>
              {s.text}
              {s.note && <small>{s.note}</small>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* --------------------------------------------------------------- log row */

function LogRow({ row }) {
  if (row.kind === "goal") {
    return <div className="nx-agent-row goal"><Flag size={12} /><div><strong>Goal</strong><pre>{row.text}</pre></div></div>;
  }

  if (row.kind === "probe") {
    const e = row.env || {};
    return (
      <div className="nx-agent-row probe">
        <Search size={12} />
        <div>Checked the machine — {e.os}/{e.arch}, {e.shell}. Found: {e.tools?.length ? e.tools.join(", ") : "none of the usual toolchains"}.</div>
      </div>
    );
  }

  if (row.kind === "plan") {
    return <div className="nx-agent-row plan"><CheckCircle2 size={12} /><div>Planned {row.steps.length} step{row.steps.length === 1 ? "" : "s"}.</div></div>;
  }

  if (row.kind === "replan") {
    return (
      <div className="nx-agent-row warn">
        <AlertTriangle size={12} />
        <div>Rejected a {row.count}-step plan as over-decomposed — asked for a regrouped one.</div>
      </div>
    );
  }

  if (row.kind === "step") {
    return <div className="nx-agent-row step"><CheckCircle2 size={12} /><div><strong>{row.text}</strong>{row.note && <small>{row.note}</small>}</div></div>;
  }

  if (row.kind === "thought") {
    return (
      <div className="nx-agent-row thought">
        <span className="nx-agent-mark" />
        <div className="nx-agent-prose"><MsgText text={row.text} /></div>
      </div>
    );
  }

  if (row.kind === "command") return <CommandRow row={row} />;

  if (row.kind === "file") {
    const verb = { write: "Wrote", append: "Appended to", read: "Read" }[row.action] || row.action;
    return (
      <div className={`nx-agent-row file ${row.status === "failed" ? "bad" : ""}`}>
        <FileText size={12} />
        <div>{verb} <code>{row.path}</code>{row.bytes ? ` — ${row.bytes} bytes` : ""}{row.result ? ` — ${row.result}` : ""}</div>
      </div>
    );
  }

  if (row.kind === "handoff") {
    return (
      <div className={`nx-agent-row ${row.status === "done" ? "ok" : row.status === "cancelled" ? "bad" : "warn"}`}>
        <Hand size={12} />
        <div>
          <strong>Handed to you</strong> — {row.request}
          {row.status === "done" && <small>{row.reply ? `You replied: ${row.reply}` : "You confirmed it was done."}</small>}
          {row.status === "cancelled" && <small>Run was stopped instead.</small>}
        </div>
      </div>
    );
  }

  if (row.kind === "error") {
    return <div className="nx-agent-row bad"><AlertTriangle size={12} /><div>{row.text}</div></div>;
  }

  if (row.kind === "stats") return <StatsRow row={row} />;

  if (row.kind === "finish") {
    return (
      <div className={`nx-agent-row finish ${row.status === "done" ? "ok" : "warn"}`}>
        {row.status === "done" ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
        <div>
          <strong>{row.status === "done" ? "Finished" : "Couldn't finish"}</strong>
          <div className="nx-agent-prose"><MsgText text={row.summary} /></div>
        </div>
      </div>
    );
  }

  return null;
}

function CommandRow({ row }) {
  const [open, setOpen] = useState(false);
  const cls = { ok: "ok", failed: "bad", timeout: "warn", error: "bad", running: "live" }[row.status] || "";

  return (
    <div className={`nx-agent-row cmd ${cls}`}>
      <Terminal size={12} />
      <div>
        {row.purpose && <small className="nx-agent-why">{row.purpose}</small>}
        <code className="nx-agent-cmdline">{row.command}</code>
        <div className="nx-agent-cmdmeta">
          {row.status === "running" && <><Loader2 size={10} className="nx-spin" /> running…</>}
          {row.status === "ok" && <>exit 0 · {fmtMs(row.ms)}</>}
          {row.status === "failed" && <>exit {row.code} · {fmtMs(row.ms)}</>}
          {row.status === "timeout" && <>killed on timeout · {fmtMs(row.ms)}</>}
          {row.status === "error" && <>could not run</>}
          {row.cwd && <span className="nx-agent-cwd">in {row.cwd}</span>}
          {row.result && (
            <button onClick={() => setOpen((v) => !v)}>{open ? "hide output" : "output"}</button>
          )}
        </div>
        {open && row.result && <pre className="nx-agent-out">{row.result}</pre>}
      </div>
    </div>
  );
}

/// Closing stats for a run. The cache line only appears when caching actually
/// did something, so it reads as a result rather than a setting.
function StatsRow({ row }) {
  const u = row.usage || {};
  const cost = engine.estimateCost(u, row.model);
  const cached = u.cacheRead || 0;
  const fresh = (u.input || 0) + (u.cacheWrite || 0);
  const saved = cached
    ? engine.fmtCost(cached * ((engine.PRICING[row.model]?.in ?? 3) * 0.9) * 1e-6)
    : null;

  return (
    <div className="nx-agent-row stats">
      <Gauge size={12} />
      <div>
        <strong>{fmtMs(row.ms)} · {row.commands} command{row.commands === 1 ? "" : "s"} · {engine.fmtCost(cost)}</strong>
        <small>
          {fmtTokens(fresh)} sent, {fmtTokens(u.output)} written, over {u.calls || 0} model call
          {u.calls === 1 ? "" : "s"}
          {row.pausedMs > 4000 && ` · ${fmtMs(row.pausedMs)} of that was waiting on you`}
        </small>
        {cached > 0 && (
          <small>{fmtTokens(cached)} tokens came from cache — about {saved} saved.</small>
        )}
      </div>
    </div>
  );
}

function fmtTokens(n) {
  const v = n || 0;
  if (v < 1000) return `${v}`;
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}k`;
  return `${(v / 1_000_000).toFixed(2)}M`;
}

function fmtMs(ms) {
  if (!ms && ms !== 0) return "";
  return ms < 1000 ? `${ms}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60000)}m`;
}

function Num({ label, hint, value, onChange, min, max }) {
  return (
    <label className="nx-agent-num">
      <span>{label}</span>
      <input
        type="number" value={value} min={min} max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
      />
      <small>{hint}</small>
    </label>
  );
}
